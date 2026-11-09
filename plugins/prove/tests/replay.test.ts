import { describe, expect, it } from "vitest";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const SCENARIO = [
  "name: read-the-badge",
  "steps:",
  "  - { id: open, operation: page.open, input: {} }",
  "  - { id: read, kind: agent, prompt: find the payment badge and read it }",
  "assertions:",
  "  - { id: badge, step: read, path: badge, equals: Paid }",
  "",
].join("\n");

const CALLS = '{"calls":[{"operation":"page.click","input":{"ref":"e3"}},{"operation":"page.read","input":{"ref":"e7"}}]}';

describe("a passed agent step is replayed", () => {
  it("by the next run with no harness started", async () => {
    const world = new ProveWorld();
    world.brief("TBO-19", SCENARIO);
    world.harnessReplies = [CALLS];
    const clicked: unknown[] = [];
    const mounted = await world.mounted([operationsPlugin("site", {
      "page.open": () => ({}),
      "page.click": (input) => { clicked.push(input); return {}; },
      "page.read": () => ({ badge: "Paid" }),
    })]);

    expect((await walk(world, mounted, newRun(mounted, "TBO-19/PROVE#1"))).record.state).toBe("PROVEN");
    expect(world.asked).toHaveLength(1);

    const again = await walk(world, mounted, newRun(mounted, "TBO-19/PROVE#2"));
    expect(again.record.state).toBe("PROVEN");
    expect(world.asked).toHaveLength(1);
    expect(clicked).toEqual([{ ref: "e3" }, { ref: "e3" }]);
  });

  it("and a replay that breaks runs the agent from the call that broke", async () => {
    const world = new ProveWorld();
    world.brief("TBO-20", SCENARIO);
    world.harnessReplies = [CALLS, '{"calls":[{"operation":"page.read","input":{"ref":"e9"}}]}'];
    let layout = "old";
    const mounted = await world.mounted([operationsPlugin("site", {
      "page.open": () => ({}),
      "page.click": () => ({}),
      "page.read": (input) => (layout === "old" || input.ref === "e9" ? { badge: "Paid" } : new Error(`no element ${String(input.ref)}`)),
    })]);
    await walk(world, mounted, newRun(mounted, "TBO-20/PROVE#1"));

    layout = "new";
    const { record } = await walk(world, mounted, newRun(mounted, "TBO-20/PROVE#2"));

    expect(record.state).toBe("PROVEN");
    expect(world.asked).toHaveLength(2);
    expect(world.asked[1]).toContain('These already ran, in order, and need not run again: [{"operation":"page.click","input":{"ref":"e3"}}]');
    expect(world.asked[1]).toContain("The kept replay broke at {\"operation\":\"page.read\",\"input\":{\"ref\":\"e7\"}}");

    // What the agent found is the replay now: the third run needs no model.
    await walk(world, mounted, newRun(mounted, "TBO-20/PROVE#3"));
    expect(world.asked).toHaveLength(2);
  });
});

describe("a replay is kept only when the step's assertions passed", () => {
  it("does not keep the calls of an agent step whose assertion failed, and asks the agent again next time", async () => {
    const world = new ProveWorld();
    world.brief("TBO-21", SCENARIO);
    world.harnessReplies = ['{"calls":[{"operation":"page.read","input":{"ref":"e2"}}]}', CALLS];
    const mounted = await world.mounted([operationsPlugin("site", {
      "page.open": () => ({}),
      "page.click": () => ({}),
      "page.read": (input) => ({ badge: input.ref === "e2" ? "Unpaid" : "Paid" }),
    })]);

    expect((await walk(world, mounted, newRun(mounted, "TBO-21/PROVE#1"))).record.state).toBe("refused");
    const again = await walk(world, mounted, newRun(mounted, "TBO-21/PROVE#2"));

    expect(world.asked).toHaveLength(2);
    expect(again.record.state).toBe("PROVEN");
  });
});

describe("a name in a file's path", () => {
  it("stays inside its directory, dots and all", async () => {
    const { segment } = await import("../src/names.js");
    const { Replays } = await import("../src/steps.js");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-replays-"));
    const proofs = path.join(root, "proofs");
    fs.mkdirSync(proofs);
    fs.writeFileSync(path.join(proofs, "OTHER-1.json"), "{}");

    new Replays(path.join(proofs, "replays")).put("..", "OTHER-1", { calls: [] });
    new Replays(path.join(proofs, "replays")).remove("..", "OTHER-1");

    expect(fs.readFileSync(path.join(proofs, "OTHER-1.json"), "utf-8")).toBe("{}");
    expect(segment("..")).toBe("%2E%2E");
  });
});
