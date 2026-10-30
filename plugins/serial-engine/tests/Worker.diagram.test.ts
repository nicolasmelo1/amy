import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Plan, Workflow, WorkflowRuntime, WorkRecord, readDiagram } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { InMemoryStore, RecordingEventLog } from "@amykit/test-fixtures";
import { Worker } from "../src/Worker.js";

const DIAGRAM = readDiagram(`stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> WORKING
    WORKING --> DONE
    ASKED --> WORKING
    DONE --> [*]
    class ASKED anywhere
    class ASKED returns
`);

/**
 * A move the diagram does not draw is a drawing mistake, not the work's.
 * The engine makes it, so nobody's work is stuck on a picture, and says so in
 * the log, which is where the picture gets fixed.
 */
describe("a move the diagram does not draw", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let log: RecordingEventLog;
  const clock = new Date("2026-10-29T12:00:00.000Z");

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-undrawn-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    log = new RecordingEventLog();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function look(at: string, to: string, history: WorkRecord["history"] = []): Promise<unknown> {
    const plan: Plan = { kind: "advance", to, effects: [], why: `to ${to}` };
    const workflow: Workflow = {
      name: "drawn",
      states: DIAGRAM.states,
      waitingStates: [],
      initialState: DIAGRAM.initial,
      terminalStates: DIAGRAM.terminal,
      diagram: DIAGRAM,
      plan: () => plan,
    };
    const runtime: WorkflowRuntime = {
      policy: {},
      found: async () => [],
      observe: async () => ({}),
      actions: {},
      apply: (record) => record,
      newRecord: (id, now) => ({ id, state: DIAGRAM.initial, updatedAt: now.toISOString(), attempts: {}, history: [] }),
    };
    records.save({ id: "w-1", state: at, updatedAt: clock.toISOString(), attempts: {}, history } as unknown as Parameters<InMemoryStore["save"]>[0]);
    queue.enqueue({ workId: "w-1", reason: "look" }, clock);
    return new Worker({
      queue,
      records,
      workflow,
      runtime,
      notifier: { announce: async () => {} },
      now: () => clock,
      log,
      config: { staleClaimMs: 60_000, retentionDays: 1, maxItemAttempts: 3, retryDelayMs: 1000 },
    }).tick();
  }

  it("applies it, and writes it to the log naming both ends", async () => {
    await look("QUEUED", "DONE");

    expect(records.load("w-1")?.state).toBe("DONE");
    expect(log.of("workflow.undrawn_transition")).toEqual([
      expect.objectContaining({ workId: "w-1", state: "QUEUED", detail: { from: "QUEUED", to: "DONE" } }),
    ]);
  });

  it("writes nothing for a drawn move, a move to an `anywhere` state, or back out of a `returns` state", async () => {
    await look("QUEUED", "WORKING");
    await look("WORKING", "ASKED");
    await look("ASKED", "WORKING", [{ at: clock.toISOString(), from: "WORKING", to: "ASKED", why: "asked" }]);

    expect(log.of("workflow.undrawn_transition")).toEqual([]);
  });

  it("writes a `returns` state leaving somewhere it did not come from", async () => {
    await look("ASKED", "DONE", [{ at: clock.toISOString(), from: "WORKING", to: "ASKED", why: "asked" }]);

    expect(log.of("workflow.undrawn_transition")).toHaveLength(1);
  });
});
