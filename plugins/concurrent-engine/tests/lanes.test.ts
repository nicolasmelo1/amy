import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigSchema, Engine, HostServices, Plugin, WorkRecord, acceptsAction, act, advance, call, defineWorkflow, mount, settled, withDiagram } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { plugin as serial } from "@amykit/plugin-serial-engine";
import { InMemoryStore } from "@amykit/test-fixtures";
import { plugin as concurrent } from "../src/plugin.js";

const NO_SETTINGS = {} satisfies ConfigSchema;

type TaskRecord = WorkRecord & { input: { task: string; looks: number }; worked?: number };

/** Every lane's move, by tick, in the order the moves were made. */
type Moves = string[][];

interface Shape {
  readonly tasks?: [string, number][];
  /** The lanes spend the agent, as a port and a method, and say they added no evidence. */
  readonly agent?: boolean;
  /** The fork is drawn inside a workflow the root calls, not in the root. */
  readonly nested?: boolean;
}

function planner(moves: Moves, shape: Shape = {}): Plugin {
  const tasks = shape.tasks ?? [["write", 1], ["review", 2], ["test", 3]];
  const task = withDiagram(defineWorkflow({
    name: "task",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    input: {
      task: { type: "string", required: true, description: "what this lane does" },
      looks: { type: "number", required: true, description: "how many looks it takes" },
    },
    output: { DONE: (record: TaskRecord) => ({ did: record.input.task, worked: record.worked ?? 0 }) },
    decide: {
      WORKING: (record: TaskRecord) => ((record.worked ?? 0) < record.input.looks ? act(`working on ${record.input.task}`, { type: "work" }) : advance("DONE", "done")),
      DONE: () => settled("done"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: shape.agent ? { work: { port: "agent", method: "ask" } } : {
      work: async (_scope, work) => {
        const name = (work.record as TaskRecord).input.task;
        if (name === "broken") throw new Error("the gate's runner is not answering");
        moves.at(-1)!.push(name);
        work.outcomes.worked = true;
      },
    },
    remember: (_scope, record: TaskRecord, outcomes) => (outcomes.worked || outcomes.work ? { ...record, worked: (record.worked ?? 0) + 1 } : record),
  }), "stateDiagram-v2\n[*] --> WORKING\nWORKING --> DONE\nDONE --> [*]\n");
  const forked = withDiagram(defineWorkflow({
    name: "planner",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    ...(shape.agent ? { progress: { maxUnchanged: 1, handoff: "park" as const } } : {}),
    calls: Object.fromEntries(["TASK_A", "TASK_B", "TASK_C"].map((lane, index) => [lane, call(task, { input: () => ({ task: tasks[index]![0], looks: tasks[index]![1] }) })])),
    decide: {
      PLANNED: () => advance("split", "planned"),
      merge: () => advance("INTEGRATED", "every lane is done"),
      INTEGRATED: () => settled("integrated"),
    },
    record: () => ({}),
    discover: async () => ["PLAN-1"],
    observe: async () => ({}),
    actions: {},
  }), `stateDiagram-v2
    state split <<fork>>
    state merge <<join>>
    [*] --> PLANNED
    PLANNED --> split
    split --> TASK_A
    split --> TASK_B
    split --> TASK_C
    TASK_A --> merge: DONE
    TASK_B --> merge: DONE
    TASK_C --> merge: DONE
    merge --> INTEGRATED
    INTEGRATED --> [*]
    class TASK_A, TASK_B, TASK_C call
`);
  if (!shape.nested) return forked;
  return withDiagram(defineWorkflow({
    name: "outer",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    calls: { WORK: call(forked) },
    decide: { DONE: () => settled("done") },
    record: () => ({}),
    discover: async () => ["PLAN-1"],
    observe: async () => ({}),
    actions: {},
  }), "stateDiagram-v2\n[*] --> WORK\nWORK --> DONE: INTEGRATED\nDONE --> [*]\nclass WORK call\n");
}

describe("the concurrent engine", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-concurrent-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function run(engine: Plugin, shape: Shape = {}, ticks = 30): Promise<{ moves: Moves; record: WorkRecord; results: { kind: string; reason?: string }[] }> {
    const moves: Moves = [];
    const records = new InMemoryStore();
    const ports: Plugin = {
      name: "ports",
      register: (registry) => {
        registry.queue(new FileQueue(path.join(root, engine.name.replace(/\W/g, "-"))));
        registry.store(records);
        registry.port("notifier", { announce: async () => undefined });
        // An agent that runs and says each run added nothing new.
        registry.port("agent", {
          ask: acceptsAction(async (action, context) => {
            if ((context.record as TaskRecord).input.task === "broken") throw new Error("the gate's runner is not answering");
            const name = (context.record as TaskRecord).input.task;
            moves.at(-1)!.push(name);
            // A lane whose name says it is getting somewhere reports so; any other added nothing.
            if (name.startsWith("good")) return { progress: { kind: "advanced", key: "tests" } };
            return { progress: { kind: "unchanged", key: "tests", detail: "the same test still fails" } };
          }),
        });
      },
    };
    const host: HostServices = {
      runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      paths: { workspace: root, checkouts: {}, state: root },
    };
    // Retried at once, so a failed look is looked at again within the run.
    const outcome = await mount([ports, planner(moves, shape), engine], { [engine.name]: { retryDelayMs: 0 } }, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const driven = outcome.mounted.engine as Engine;
    await driven.discover();
    const results: { kind: string; reason?: string }[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      moves.push([]);
      const result = (await driven.tick()) as { kind: string; reason?: string };
      results.push(result);
      if (result.kind === "idle") break;
    }
    return { moves: moves.filter((tick) => tick.length > 0), record: records.load("PLAN-1")!, results };
  }

  it("moves every lane that has a move in one tick, one move each", async () => {
    const { moves, record } = await run(concurrent);

    expect(moves).toEqual([["write", "review", "test"], ["review", "test"], ["test"]]);
    expect(record.state).toBe("INTEGRATED");
  });

  it("reaches the same record as the serial engine, which moves the lanes one look at a time, in turn", async () => {
    const side = await run(concurrent);
    const turn = await run(serial);

    expect(turn.moves).toEqual([["write"], ["review"], ["test"], ["review"], ["test"], ["test"]]);
    const shape = (record: WorkRecord) => ({
      state: record.state,
      history: record.history.map((step) => `${step.from}>${step.to}`),
      lanes: record.lanes,
      calls: Object.fromEntries(Object.entries(record.calls ?? {}).map(([id, child]) => [id, { state: child.state, attempts: child.attempts, history: child.history.map((step) => step.to) }])),
    });
    expect(shape(side.record)).toEqual(shape(turn.record));
  });

  it("keeps the moves the other lanes made when one lane throws, and fails the look", async () => {
    // Two ticks: the first enters the fork, the second moves the lanes.
    const { record, results } = await run(concurrent, { tasks: [["write", 1], ["broken", 1], ["test", 1]] }, 2);

    expect(results.at(-1)).toMatchObject({ kind: "failed", error: "the gate's runner is not answering" });
    const worked = Object.values(record.calls ?? {}).map((child) => [child.input?.task, child.attempts.WORKING ?? 0]);
    expect(worked).toEqual([["write", 1], ["broken", 0], ["test", 1]]);
  });

  it("moves the lanes of a fork drawn inside a workflow the root calls side by side too", async () => {
    const { moves, record } = await run(concurrent, { nested: true });

    expect(moves).toEqual([["write", "review", "test"], ["review", "test"], ["test"]]);
    expect(record.state).toBe("DONE");
  });

  it("asks each lane whether another agent run would add any evidence, and parks when none would", async () => {
    const { moves, results } = await run(concurrent, { agent: true, tasks: [["write", 3], ["review", 3], ["test", 3]] }, 6);

    // One round side by side; every lane said nothing changed, and the next
    // round is refused before any agent is asked again.
    expect(moves).toEqual([["write", "review", "test"]]);
    expect(results.some((result) => result.kind === "parked" && /would add no evidence/.test(result.reason ?? ""))).toBe(true);
  });

  it("counts each lane's evidence on its own, so a lane is never parked for its siblings' runs, and both engines end the same", async () => {
    const shape: Shape = { agent: true, tasks: [["write", 3], ["review", 3], ["test", 3]] };
    const side = await run(concurrent, shape, 8);
    const turn = await run(serial, shape, 12);

    // Every lane ran once and said nothing changed; none ran a second time.
    const ran = (moves: Moves) => moves.flat().sort();
    expect(ran(turn.moves)).toEqual(["review", "test", "write"]);
    expect(ran(side.moves)).toEqual(ran(turn.moves));
    const attempts = (record: WorkRecord) => Object.values(record.calls ?? {}).map((child) => child.attempts.WORKING ?? 0);
    expect(attempts(turn.record)).toEqual(attempts(side.record));
  });

  it("keeps the evidence the other lanes reported when one lane throws, so a retry buys them no run past the ceiling", async () => {
    const { moves, results } = await run(concurrent, { agent: true, tasks: [["write", 3], ["broken", 3], ["test", 3]] }, 6);

    expect(results.filter((result) => result.kind === "failed").length).toBeGreaterThan(1);
    expect(moves.flat().sort()).toEqual(["test", "write"]);
  });

  it("lets the other lanes run on in turn when one may not, and ends where moving them side by side does", async () => {
    const shape: Shape = { agent: true, tasks: [["stuck", 3], ["good-a", 3], ["good-b", 3]] };
    const turn = await run(serial, shape, 16);
    const side = await run(concurrent, shape, 10);

    const attempts = (record: WorkRecord) => Object.values(record.calls ?? {}).map((child) => [child.input?.task, child.state, child.attempts.WORKING ?? 0]);
    expect(attempts(turn.record)).toEqual([["stuck", "WORKING", 1], ["good-a", "DONE", 3], ["good-b", "DONE", 3]]);
    expect(attempts(side.record)).toEqual(attempts(turn.record));
  });

  it("moves the turn past a lane that keeps throwing, so its siblings still finish in turn", async () => {
    const { record } = await run(serial, { tasks: [["broken", 2], ["write", 2], ["test", 2]] }, 20);

    const states = Object.values(record.calls ?? {}).map((child) => [child.input?.task, child.state]);
    expect(states).toEqual([["broken", "WORKING"], ["write", "DONE"], ["test", "DONE"]]);
  });
});
