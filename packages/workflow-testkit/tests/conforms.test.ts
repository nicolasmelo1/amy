import { describe, expect, it } from "vitest";
import { WorkRecord, WorkflowRuntime, unitOf } from "@amykit/core";
import { ConformanceError, PROPERTIES, PortCall, Runner, World, conformance, conforms, watched } from "../src/index.js";
import { advance, runtimeOf, settled, workflowOf } from "./machines.js";

/** Collects what `conforms` registers, so a test can run each one and read the result. */
function recordingRunner() {
  const suites: string[] = [];
  const tests: { name: string; body: () => Promise<void> }[] = [];
  const runner: Runner = {
    describe: (name, body) => {
      suites.push(name);
      body();
    },
    it: (name, body) => {
      tests.push({ name, body });
    },
  };
  return { runner, suites, tests };
}

const received = () =>
  workflowOf({
    states: ["received", "done"],
    terminal: ["done"],
    plan: (record) => (record.state === "received" ? advance("done") : settled()),
  });

describe("conforms", () => {
  it("registers one test per property, named for what it claims", () => {
    const { runner, suites, tests } = recordingRunner();

    conforms(received(), { runner, runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [{ name: "w" }] });

    expect(suites).toEqual(["tiny conforms to the machine"]);
    expect(tests.map((test) => test.name)).toEqual(Object.values(PROPERTIES));
  });

  it("goes green for a workflow that conforms, walking each world once standing alone and once called as a phase", async () => {
    const { runner, tests } = recordingRunner();
    let walked = 0;

    conforms(received(), {
      runner,
      runtime: () => {
        walked += 1;
        return runtimeOf("received", { observe: () => ({}) });
      },
      worlds: [{ name: "w" }],
    });

    for (const test of tests) await expect(test.body()).resolves.toBeUndefined();
    expect(walked).toBe(2);
  });

  it("goes red under the property that failed, with every finding in the message", async () => {
    const { runner, tests } = recordingRunner();

    conforms(received(), {
      runner,
      runtime: () => runtimeOf("received", { observe: () => ({}), actions: { page: undefined } }),
      worlds: [{ name: "w" }],
    });

    const handlers = tests.find((test) => test.name === PROPERTIES.handlers)!;
    const error = await handlers.body().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ConformanceError);
    expect((error as Error).message).toBe(
      "every action it plans has a handler that survives being called, and it did not:\n" +
        "  - action `page` is declared with no implementation — give it a handler, or a port and a method",
    );
    await expect(tests.find((test) => test.name === PROPERTIES.reachability)!.body()).resolves.toBeUndefined();
  });

  it("asks for a runner when there are no globals to use", () => {
    expect(() => conforms(received(), { runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [] })).toThrow(
      /conforms needs a test runner/,
    );
  });

  it("says so when no world was given", async () => {
    const { runner, tests } = recordingRunner();

    conforms(received(), { runner, runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [] });

    await expect(tests[0]!.body()).rejects.toThrow("no world was given, so nothing was walked");
  });
});

/**
 * A unit's whole world: a tracker that knows `SHOP-1` and nothing else, a
 * conversation, and a checkout keyed by whatever the workflow hands it. The
 * workflow under test names its work through `ids`, the lines a bug is in.
 */
function shop(ids: { tracker: (record: WorkRecord) => string; thread: (record: WorkRecord) => string }) {
  const shipped = workflowOf<{ found: boolean }>({
    states: ["received", "done", "declined"],
    terminal: ["done", "declined"],
    plan: (record, observation) => (record.state !== "received" ? settled() : observation.found ? advance("done", "ship") : advance("declined")),
  });
  const checkouts: string[] = [];
  const world = (): World & { runtime: () => WorkflowRuntime<WorkRecord, { found: boolean }> } => {
    const said: PortCall[] = [];
    const tracker = watched("tracker", { get: async (id: string) => (id === "SHOP-1" ? { id } : null) }, said);
    const conversation = watched("conversation", { open: async (id: string) => ({ id }) }, said);
    return {
      name: "a shop",
      workId: "SHOP-1",
      said: () => said,
      again: world,
      runtime: () => runtimeOf<WorkRecord, { found: boolean }>("received", {
        observe: async (record) => ({ found: (await tracker.get(ids.tracker(record))) !== null }),
        actions: {
          ship: async (_action, ctx) => {
            await conversation.open(ids.thread(ctx.record));
            checkouts.push(ctx.record.id);
          },
        },
      }),
    };
  };
  const walked = (found: Awaited<ReturnType<typeof conformance>>) => found.filter((finding) => finding.property === "called").map((finding) => finding.message);
  const run = async () => walked(await conformance(shipped, { runtime: (current) => (current as ReturnType<typeof world>).runtime(), worlds: [world()] }));
  return { checkouts, run };
}

describe("a workflow called as a phase", () => {
  it("fails one that names the call to the tracker, plans differently and rests elsewhere, saying each", async () => {
    const { run } = shop({ tracker: (record) => record.id, thread: unitOf });

    expect(await run()).toEqual([
      "a shop: called as `SHOP-1/PHASE#1`, it names a different unit to the tracker: it asks `tracker.get(\"SHOP-1/PHASE#1\")`, naming the call it runs under, where standing alone it asked `tracker.get(\"SHOP-1\")`",
      "a shop: called as `SHOP-1/PHASE#1`, it plans nothing more where standing alone it planned `ship`",
      "a shop: called as `SHOP-1/PHASE#1`, it comes to rest in `declined`, where standing alone it rests in `done`",
    ]);
  });

  it("fails one that opens a conversation of the call's own, rather than the unit's", async () => {
    const { run } = shop({ tracker: unitOf, thread: (record) => record.id });

    expect(await run()).toEqual([
      "a shop: called as `SHOP-1/PHASE#1`, it opens a different conversation: it asks `conversation.open(\"SHOP-1/PHASE#1\")`, naming the call it runs under, where standing alone it asked `conversation.open(\"SHOP-1\")`",
    ]);
  });

  it("holds a workflow that names the unit to conform, its checkout keyed by each record's own id", async () => {
    const { checkouts, run } = shop({ tracker: unitOf, thread: unitOf });

    expect(await run()).toEqual([]);
    expect(checkouts).toEqual(["SHOP-1", "SHOP-1/PHASE#1"]);
  });

  it("fails one whose write names the call where standing alone it named the unit, the same action by type", async () => {
    const asking = workflowOf({
      states: ["asking", "done"],
      terminal: ["done"],
      plan: (record) => (record.state === "asking" ? { kind: "advance", to: "done", why: "asked", effects: [{ type: "announce", text: `Question for ${record.id}` }] } : settled()),
    });

    const findings = await conformance(asking, {
      runtime: () => runtimeOf("asking", { observe: () => ({}), actions: { announce: async () => {} } }),
      worlds: [{ name: "a question", workId: "SHOP-1" }],
    });

    expect(findings.filter((finding) => finding.property === "called").map((finding) => finding.message)).toEqual([
      "a question: called as `SHOP-1/PHASE#1`, it plans `announce {\"text\":\"Question for SHOP-1/PHASE#1\"}` where standing alone it planned `announce {\"text\":\"Question for SHOP-1\"}`",
    ]);
  });

  it("calls the record a world's own start names, not the world's name", async () => {
    const ids: string[] = [];
    const findings = await conformance(received(), {
      runtime: () => runtimeOf("received", { observe: (record) => void ids.push(record.id) }),
      worlds: [{ name: "an unanswered ticket", start: (now) => ({ id: "SHOP-1", state: "received", updatedAt: now.toISOString(), attempts: {}, history: [] }) }],
    });

    expect(findings.filter((finding) => finding.property === "called" || finding.property === "walk")).toEqual([]);
    expect([...new Set(ids)]).toEqual(["SHOP-1", "SHOP-1/PHASE#1"]);
  });

  it("walks every world called as a phase, with no way to leave it out", async () => {
    const ids: string[] = [];
    const findings = await conformance(received(), {
      runtime: () => runtimeOf("received", { observe: (record) => void ids.push(record.id) }),
      worlds: [{ name: "w", workId: "W-1" }],
    });

    expect(findings).toEqual([]);
    expect([...new Set(ids)]).toEqual(["W-1", "W-1/PHASE#1"]);
    expect(Object.keys(PROPERTIES)).toContain("called");
  });
});
