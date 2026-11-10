import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

describe("a lease lock left by a daemon that died holding it", () => {
  const source = path.resolve(import.meta.dirname, "..", "src", "lease.ts");

  /** A pid that was alive a moment ago and is not now. */
  function deadPid(): number {
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf-8" });
    return Number(child.stdout);
  }

  it("is reclaimed by one process at a time: processes racing on it never hold a seat twice", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lock-race-"));
    const lock = path.join(root, "account.json.lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: deadPid(), stamp: "dead" }));
    const script = path.join(root, "claim.mts");
    fs.writeFileSync(script, [
      `import { Leases } from ${JSON.stringify(pathToFileURL(source).href)};`,
      "const [root, holder, start] = process.argv.slice(2);",
      "while (Date.now() < Number(start)) {}",
      "const claimed = new Leases(root).claim({ resource: \"account\", capacity: 1, holder, priority: 0, ttlMs: 60_000 });",
      "process.stdout.write(claimed.held ? \"held\" : \"waiting\");",
    ].join("\n"));
    const start = Date.now() + 1500;
    const racers = Array.from({ length: 6 }, (_, at) => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", script, root, `run-${at}`, String(start)], { cwd: path.resolve(import.meta.dirname, "..", "..", "..") });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`racer exited ${code}`))));
    }));

    const answers = await Promise.all(racers);

    expect(answers.filter((one) => one === "held")).toHaveLength(1);
    expect(new Leases(root).holders("account")).toHaveLength(1);
    expect(fs.existsSync(lock)).toBe(false);
  }, 30_000);

  it("is never reclaimed while its owner lives, however long it has stood", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lock-live-"));
    const lock = path.join(root, "account.json.lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, stamp: "mine" }));
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lock, old, old);

    expect(() => new Leases(root, () => new Date(), 200).claim({ resource: "account", capacity: 1, holder: "x", priority: 0, ttlMs: 1000 })).toThrow("stayed taken");
    expect(JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf-8"))).toEqual({ pid: process.pid, stamp: "mine" });
  });
});

describe("a run that lost its seat mid-scenario", () => {
  it("starts the scenario over once it has a seat again, keeping nothing the old resource answered", async () => {
    const world = new ProveWorld({ resources: { account: { capacity: 1, check: "ok" } }, policy: { leaseTtlMs: 5000 } }, { ok });
    world.brief("TBO-41", "name: n\nresources: [account]\nsteps:\n  - { id: open, operation: bank.open, input: {} }\n  - { id: look, kind: human, ask: is it there?, deadlineMs: 600000 }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    const mounted = await world.mounted([operationsPlugin("bank", { "bank.open": () => ({ open: true }) })]);
    const asking = await walk(world, mounted, newRun(mounted, "TBO-41/PROVE#1"), { throughWaits: true, until: (record) => record.state === "ASKING" && record.asking !== undefined });
    expect(asking.record.results?.open).toBeDefined();

    world.clock += 6000;
    const { record } = await walk(world, mounted, asking.record);

    expect(record.state).toBe("LEASING");
    expect(record.results).toBeUndefined();
  });
});
