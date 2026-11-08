import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Leases } from "../src/lease.js";
import { holderOf, leasesAt } from "../src/plugin.js";
import { ProveWorld, look, newRun, operationsPlugin, walk } from "./world.js";

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
    expect(new Leases(leasesAt(home), invoices.now).holders("account")).toEqual([holderOf(invoices.host().paths, { id: "INV-1/PROVE#1" })]);

    const done = await walk(invoices, first, holding.record);
    expect(done.record.state).toBe("PROVEN");
    const after = await walk(payroll, second, waiting.record, { throughWaits: true });
    expect(after.record.state).toBe("PROVEN");
    expect(after.record.attempts.LEASING ?? 0).toBe(0);
  });
});

describe("a run needing several resources", () => {
  const resources = { api: { capacity: 1, check: "ok" }, account: { capacity: 1, check: "ok" } };
  const scenario = (name: string, order: string) => `name: ${name}\nresources: [${order}]\nsteps:\n  - { id: open, operation: bank.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n`;

  it("holds none of them while it waits for one, so two runs crossing their claims both finish", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-machine-"));
    const one = new ProveWorld({ resources }, { ok }, home);
    const other = new ProveWorld({ resources }, { ok }, home);
    Object.assign(other, { artifacts: path.join(home, "projects", "q", "artifacts") });
    one.brief("A-1", scenario("a", "api, account"));
    other.brief("B-1", scenario("b", "account, api"));
    const bank = () => operationsPlugin("bank", { "bank.open": () => ({ open: true }) });
    const first = await one.mounted([bank()]);
    const second = await other.mounted([bank()]);
    // B takes `account` before A asks for anything.
    const leases = new Leases(leasesAt(home), one.now);
    const bHolder = holderOf(other.host().paths, { id: "B-1/PROVE#1" });
    leases.claim({ resource: "account", capacity: 1, holder: bHolder, priority: 0, ttlMs: 60_000 });

    let a = (await walk(one, first, newRun(first, "A-1/PROVE#1"))).record;
    expect(a.held).toEqual([]);
    expect(leases.holders("api")).toEqual([]);

    let b = newRun(second, "B-1/PROVE#1");
    for (let turn = 0; turn < 30 && (a.state !== "PROVEN" || b.state !== "PROVEN"); turn += 1) {
      one.clock += 1000;
      other.clock = one.clock;
      if (a.state !== "PROVEN") a = (await look(first, a, one.now())).record;
      if (b.state !== "PROVEN") b = (await look(second, b, other.now())).record;
    }
    expect([a.state, b.state]).toEqual(["PROVEN", "PROVEN"]);
  });

  it("names its holder by its profile, so two projects proving the same work id take turns", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-machine-"));
    const shop = new ProveWorld({ resources: { account: { capacity: 1, check: "ok" } } }, { ok }, home);
    const blog = new ProveWorld({ resources: { account: { capacity: 1, check: "ok" } } }, { ok }, home);
    Object.assign(blog, { host: () => ({ ...shop.host(), paths: { ...shop.host().paths, profile: path.join(home, "projects", "q", "prove"), artifacts: path.join(home, "projects", "q", "artifacts") } }) });
    for (const world of [shop, blog]) world.brief("TBO-1", SCENARIO);
    const first = await shop.mounted([operationsPlugin("bank", { "bank.open": () => ({ open: true }) })]);
    const second = await blog.mounted([operationsPlugin("bank", { "bank.open": () => ({ open: true }) })]);

    const holding = await walk(shop, first, newRun(first, "TBO-1/PROVE#1"), { until: (record) => record.state === "RUNNING" });
    const waiting = await walk(blog, second, newRun(second, "TBO-1/PROVE#1"));

    expect(holding.record.held).toEqual(["account"]);
    expect(waiting.record.state).toBe("LEASING");
    expect(new Leases(leasesAt(home), shop.now).holders("account")).toHaveLength(1);
  });
});

describe("a resource more than one run holds", () => {
  it("is taken down only by the last holder", async () => {
    const world = new ProveWorld({ resources: { app: { capacity: 2, up: "up", check: "ok", down: "down" } } }, { up: ok, ok, down: ok });
    world.brief("A-1", "name: a\nresources: [app]\nsteps:\n  - { id: open, operation: app.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    world.brief("B-1", "name: b\nresources: [app]\nsteps:\n  - { id: open, operation: app.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    const mounted = await world.mounted([operationsPlugin("app", { "app.open": () => ({ open: true }) })]);
    const a = await walk(world, mounted, newRun(mounted, "A-1/PROVE#1"), { until: (record) => record.state === "RUNNING" });
    const b = await walk(world, mounted, newRun(mounted, "B-1/PROVE#1"), { until: (record) => record.state === "RUNNING" });

    await walk(world, mounted, a.record);
    expect(world.ran.filter((one) => one === "down")).toEqual([]);
    await walk(world, mounted, b.record);
    expect(world.ran.filter((one) => one === "down")).toEqual(["down"]);
  });
});
