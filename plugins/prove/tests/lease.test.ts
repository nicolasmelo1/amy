import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Leases } from "../src/lease.js";
import { leasesAt } from "../src/plugin.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const ok = () => ({ ok: true, output: "" });
const SCENARIO = "name: uses-the-account\nresources: [account]\nsteps:\n  - { id: open, operation: bank.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n";

describe("a lease whose holder stops renewing", () => {
  it("expires, and the run it belonged to goes back to waiting for a seat", async () => {
    const config = { resources: { account: { capacity: 1, check: "account-check" } }, "policy.leaseTtlMs": 5000 };
    const world = new ProveWorld({ resources: config.resources, policy: { leaseTtlMs: 5000 } }, { "account-check": ok });
    world.brief("TBO-11", "name: n\nresources: [account]\nsteps:\n  - { id: look, kind: human, ask: is it there?, deadlineMs: 600000 }\n  - { id: open, operation: bank.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    const mounted = await world.mounted([operationsPlugin("bank", { "bank.open": () => ({ open: true }) })]);
    const asking = await walk(world, mounted, newRun(mounted, "TBO-11/PROVE#1"), { throughWaits: true, until: (record) => record.state === "ASKING" && record.asking !== undefined });
    expect(asking.record.held).toEqual(["account"]);

    // The daemon stops: nobody renews, and the seat goes to somebody else.
    world.clock += 6000;
    const leases = new Leases(leasesAt(world.home), world.now);
    expect(leases.claim({ resource: "account", capacity: 1, holder: "other", priority: 0, ttlMs: 60_000 }).held).toBe(true);

    const { record, looks } = await walk(world, mounted, asking.record);
    expect(looks[0]).toMatchObject({ from: "ASKING", to: "LEASING" });
    expect(record.state).toBe("LEASING");
    expect(record.held).toEqual([]);
    expect(record.attempts.LEASING ?? 0).toBe(0);
  });
});

describe("leases are the machine's", () => {
  it("never let two runs from different projects hold one resource past its capacity, and the waiting one starts on the release", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-machine-"));
    const resources = { account: { capacity: 1, check: "account-check", down: "account-down" } };
    const commands = { "account-check": ok, "account-down": ok };
    const invoices = new ProveWorld({ resources }, commands, home);
    const payroll = new ProveWorld({ resources }, commands, home);
    Object.assign(payroll, { artifacts: path.join(home, "projects", "q", "artifacts") });
    invoices.brief("INV-1", SCENARIO);
    payroll.brief("PAY-1", SCENARIO);
    const bank = () => operationsPlugin("bank", { "bank.open": () => ({ open: true }) });
    const first = await invoices.mounted([bank()]);
    const second = await payroll.mounted([bank()]);

    const holding = await walk(invoices, first, newRun(first, "INV-1/PROVE#1"), { until: (record) => record.state === "RUNNING" });
    const waiting = await walk(payroll, second, newRun(second, "PAY-1/PROVE#1"));
    expect(holding.record.held).toEqual(["account"]);
    expect(waiting.record).toMatchObject({ state: "LEASING" });
    expect(waiting.looks.at(-1)!.plan).toMatchObject({ kind: "wait", why: "waiting for a seat on `account`" });
    expect(new Leases(leasesAt(home), invoices.now).holders("account")).toEqual(["INV-1/PROVE#1"]);

    const done = await walk(invoices, first, holding.record);
    expect(done.record.state).toBe("PROVEN");
    const after = await walk(payroll, second, waiting.record, { throughWaits: true });
    expect(after.record.state).toBe("PROVEN");
    expect(after.record.attempts.LEASING ?? 0).toBe(0);
  });
});
