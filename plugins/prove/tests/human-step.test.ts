import { describe, expect, it } from "vitest";
import { Leases } from "../src/lease.js";
import { leasesAt } from "../src/plugin.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const ok = () => ({ ok: true, output: "" });
const SCENARIO = [
  "name: a-person-looks",
  "resources: [account]",
  "steps:",
  "  - { id: open, operation: bank.open, input: {} }",
  "  - { id: look, kind: human, ask: Does the statement show the refund?, deadlineMs: 3600000 }",
  "assertions:",
  "  - { id: opened, step: open, path: open, equals: true }",
  "  - { id: seen, step: look, path: answer }",
  "",
].join("\n");

async function asking() {
  const world = new ProveWorld({ resources: { account: { capacity: 1, check: "account-check", down: "account-down" } } }, { "account-check": ok, "account-down": ok });
  world.brief("TBO-14", SCENARIO);
  const mounted = await world.mounted([operationsPlugin("bank", { "bank.open": () => ({ open: true }) })]);
  const { record } = await walk(world, mounted, newRun(mounted, "TBO-14/PROVE#1"), { throughWaits: true, until: (one) => one.state === "ASKING" && one.asking !== undefined });
  return { world, mounted, record };
}

describe("a human step", () => {
  it("asks in the work's thread, and the notifier names the step and the resources it holds", async () => {
    const { world, record } = await asking();

    expect(world.posted).toEqual([{ thread: "thread-TBO-14", text: expect.stringContaining("Does the statement show the refund?") }]);
    expect(world.said).toHaveLength(1);
    expect(world.said[0]!.text).toContain("stopped at the step `look`");
    expect(world.said[0]!.text).toContain("It holds `account`");
    expect(record.asking).toMatchObject({ step: "look", thread: "thread-TBO-14" });
  });

  it("keeps the run's leases while it waits", async () => {
    const { world, mounted, record } = await asking();
    let waited = record;
    for (let look = 0; look < 5; look += 1) {
      world.clock += 9 * 60 * 1000;
      waited = (await walk(world, mounted, waited)).record;
    }

    expect(waited.state).toBe("ASKING");
    expect(new Leases(leasesAt(world.home), world.now).holders("account")).toEqual(["TBO-14/PROVE#1"]);
  });

  it("resumes on an answer", async () => {
    const { world, mounted, record } = await asking();
    world.answer("thread-TBO-14", "yes, the refund is there");

    const done = await walk(world, mounted, record);

    expect(done.record.state).toBe("PROVEN");
    expect(done.record.results?.look).toEqual({ status: "done", output: { answer: "yes, the refund is there", by: "ada" } });
  });

  it("escalates at its deadline and releases the leases", async () => {
    const { world, mounted, record } = await asking();
    world.clock += 3600000 + 1;

    const done = await walk(world, mounted, record);

    expect(done.record.state).toBe("refused");
    expect(world.said.at(-1)).toMatchObject({ kind: "gave-up", text: expect.stringContaining("Nobody answered `look`") });
    expect(new Leases(leasesAt(world.home), world.now).holders("account")).toEqual([]);
    expect(world.ran).toContain("account-down");
    expect(done.record.verdict?.refused).toMatch(/^nobody answered `look` before /);
  });
});
