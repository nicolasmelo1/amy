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

/** An agent's turns: click, read, and done once the read answered. */
const AGENT = ['{"call":{"operation":"page.click","input":{"ref":"e3"}}}', '{"call":{"operation":"page.read","input":{"ref":"e7"}}}', '{"done":true}'];

describe("a passed agent step is replayed", () => {
  it("by the next run with no harness started", async () => {
    const world = new ProveWorld();
    world.brief("TBO-19", SCENARIO);
    world.harnessReplies = [...AGENT];
    const clicked: unknown[] = [];
    const mounted = await world.mounted([operationsPlugin("site", {
      "page.open": () => ({}),
      "page.click": (input) => { clicked.push(input); return {}; },
      "page.read": () => ({ badge: "Paid" }),
    })]);

    expect((await walk(world, mounted, newRun(mounted, "TBO-19/PROVE#1"))).record.state).toBe("PROVEN");
    expect(world.asked).toHaveLength(3);

    const again = await walk(world, mounted, newRun(mounted, "TBO-19/PROVE#2"));
    expect(again.record.state).toBe("PROVEN");
    expect(world.asked).toHaveLength(3);
    expect(clicked).toEqual([{ ref: "e3" }, { ref: "e3" }]);
  });

  it("and a replay that breaks runs the agent from the call that broke", async () => {
    const world = new ProveWorld();
    world.brief("TBO-20", SCENARIO);
    world.harnessReplies = [...AGENT, '{"call":{"operation":"page.read","input":{"ref":"e9"}}}', '{"done":true}'];
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
    expect(world.asked).toHaveLength(5);
    expect(world.asked[3]).toContain('A kept replay already ran these, in order, and they need not run again: [{"operation":"page.click","input":{"ref":"e3"}}]');
    expect(world.asked[3]).toContain('- {"operation":"page.read","input":{"ref":"e7"}} → failed:');

    // What the agent found is the replay now: the third run needs no model.
    await walk(world, mounted, newRun(mounted, "TBO-20/PROVE#3"));
    expect(world.asked).toHaveLength(5);
  });
});

describe("a replay is kept only when the step's assertions passed", () => {
  it("does not keep the calls of an agent step whose assertion failed, and asks the agent again next time", async () => {
    const world = new ProveWorld();
    world.brief("TBO-21", SCENARIO);
    world.harnessReplies = ['{"call":{"operation":"page.read","input":{"ref":"e2"}}}', '{"done":true}', ...AGENT];
    const mounted = await world.mounted([operationsPlugin("site", {
      "page.open": () => ({}),
      "page.click": () => ({}),
      "page.read": (input) => ({ badge: input.ref === "e2" ? "Unpaid" : "Paid" }),
    })]);

    expect((await walk(world, mounted, newRun(mounted, "TBO-21/PROVE#1"))).record.state).toBe("refused");
    const again = await walk(world, mounted, newRun(mounted, "TBO-21/PROVE#2"));

    expect(world.asked).toHaveLength(5);
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

describe("an agent step is a loop", () => {
  it("shows each turn the input schemas and what every call answered, so a ref one call returns is used by the next", async () => {
    const world = new ProveWorld();
    world.brief("TBO-22", "name: pay-in-the-app\nsteps:\n  - { id: open, operation: app.launch, input: {} }\n  - { id: pay, kind: agent, prompt: press Pay }\nassertions:\n  - { id: paid, step: pay, path: paid, equals: true }\n");
    world.harnessReplies = ['{"call":{"operation":"desktop.snapshot","input":{}}}', '{"call":{"operation":"desktop.click","input":{"ref":"@s1:e7"}}}', '{"done":true}'];
    const mounted = await world.mounted([operationsPlugin("desktop", {
      "app.launch": () => ({}),
      "desktop.snapshot": () => ({ snapshot: "s1", tree: { children: [{ name: "Pay", ref_id: "@s1:e7" }] } }),
      "desktop.click": (input) => (input.ref === "@s1:e7" ? { paid: true } : new Error(`no ${String(input.ref)}`)),
    })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-22/PROVE#1"));

    expect(record.state).toBe("PROVEN");
    expect(world.asked[0]).toContain("- `desktop.click`: {");
    expect(world.asked[1]).toContain('"ref_id":"@s1:e7"');
  });

  it("is unsupported once it has taken every turn it may without saying done", async () => {
    const world = new ProveWorld();
    world.brief("TBO-23", SCENARIO);
    world.harnessReplies = Array.from({ length: 20 }, () => '{"call":{"operation":"page.click","input":{"ref":"e1"}}}');
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({}), "page.click": () => ({}) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-23/PROVE#1"));

    expect(record.results?.read).toEqual({ status: "unsupported", why: "the agent did not settle `read` in 12 turns" });
  });
});
