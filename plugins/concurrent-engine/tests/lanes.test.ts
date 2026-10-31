import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigSchema, Engine, HostServices, Plugin, WorkRecord, act, advance, call, defineWorkflow, mount, settled, withDiagram } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { plugin as serial } from "@amykit/plugin-serial-engine";
import { InMemoryStore } from "@amykit/test-fixtures";
import { plugin as concurrent } from "../src/plugin.js";

const NO_SETTINGS = {} satisfies ConfigSchema;

type TaskRecord = WorkRecord & { input: { task: string; looks: number }; worked?: number };

/** Every lane's move, by tick, in the order the moves were made. */
type Moves = string[][];

function planner(moves: Moves, tasks: [string, number][] = [["write", 1], ["review", 2], ["test", 3]]): Plugin {
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
    actions: {
      work: async (_scope, work) => {
        const name = (work.record as TaskRecord).input.task;
        if (name === "broken") throw new Error("the gate's runner is not answering");
        moves.at(-1)!.push(name);
        work.outcomes.worked = true;
      },
    },
    remember: (_scope, record: TaskRecord, outcomes) => (outcomes.worked ? { ...record, worked: (record.worked ?? 0) + 1 } : record),
  }), "stateDiagram-v2\n[*] --> WORKING\nWORKING --> DONE\nDONE --> [*]\n");
  return withDiagram(defineWorkflow({
    name: "planner",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
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
}

describe("the concurrent engine", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-concurrent-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function run(engine: Plugin, tasks?: [string, number][], ticks = 30): Promise<{ moves: Moves; record: WorkRecord; results: { kind: string }[] }> {
    const moves: Moves = [];
    const records = new InMemoryStore();
    const ports: Plugin = {
      name: "ports",
      register: (registry) => {
        registry.queue(new FileQueue(path.join(root, engine.name.replace(/\W/g, "-"))));
        registry.store(records);
        registry.port("notifier", { announce: async () => undefined });
      },
    };
    const host: HostServices = {
      runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      paths: { workspace: root, checkouts: {}, state: root },
    };
    const outcome = await mount([ports, planner(moves, tasks), engine], {}, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const driven = outcome.mounted.engine as Engine;
    await driven.discover();
    const results: { kind: string }[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      moves.push([]);
      const result = (await driven.tick()) as { kind: string };
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
    const { record, results } = await run(concurrent, [["write", 1], ["broken", 1], ["test", 1]], 2);

    expect(results.at(-1)).toMatchObject({ kind: "failed", error: "the gate's runner is not answering" });
    const worked = Object.values(record.calls ?? {}).map((child) => [child.input?.task, child.attempts.WORKING ?? 0]);
    expect(worked).toEqual([["write", 1], ["broken", 0], ["test", 1]]);
  });
});
