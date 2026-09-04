import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker, WorkerDeps } from "../src/Worker.js";
import { FileQueue } from "@amy/plugin-file-queue";
import { LogBudget } from "@amy/core";
import { WORKDAY } from "@amy/test-fixtures";
import {
  ticketWorkerDeps,
  InMemoryStore,
  RecordingEventLog,
  RecordingNotifier,
  fakeAgent,
  fakeTracker,
  workerConfig,
} from "@amy/test-fixtures";

/**
 * One warning on the way down, silence while it is down, one when it comes
 * back. The signal is the queue item's own attempt count, which survives the
 * process ending between ticks.
 */
describe("a dependency that goes down and comes back", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let notifier: RecordingNotifier;
  let log: RecordingEventLog;
  let clock: Date;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-failures-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    notifier = new RecordingNotifier();
    log = new RecordingEventLog();
    clock = new Date(WORKDAY);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: Partial<WorkerDeps> = {}): Worker {
    return new Worker({
      queue,
      records,
      ...ticketWorkerDeps({
        notifier,
        now: () => clock,
        log,
        ...overrides,
      }),
    });
  }

  /** A tracker that is down, which is what a `gh` outage looks like from here. */
  const down = () =>
    fakeTracker({ get: vi.fn().mockRejectedValue(new Error("could not connect to the tracker")) });

  /** Past the backoff, because the retried item is held behind it. */
  function later(): void {
    clock = new Date(clock.getTime() + workerConfig.retryDelayMs + 1000);
  }

  it("warns once on the first failure", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ tracker: down() }).tick();

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toContain("PROJ-1239 is failing in DISCOVERED and I am retrying");
    expect(log.of("work.degraded")).toHaveLength(1);
    expect(log.of("work.degraded")[0]?.detail).toMatchObject({ attempt: 1 });
  });

  it("stays quiet on the middle attempts", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const worker = build({ tracker: down() });

    await worker.tick();
    later();
    await worker.tick();
    later();
    await worker.tick();

    // Three failures, one warning. You are told on the way down, not on the
    // fifth attempt.
    expect(notifier.sent).toHaveLength(1);
    expect(queue.pending()[0]?.attempt).toBe(3);
  });

  it("warns once when it recovers, and says how many attempts failed", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ tracker: down() }).tick();
    later();
    await build().tick();

    expect(notifier.sent).toHaveLength(2);
    expect(notifier.sent[1]).toContain("PROJ-1239 is moving again in DISCOVERED after 1");
    expect(log.of("work.recovered")[0]?.detail).toMatchObject({ afterAttempts: 1 });
  });

  it("carries on from where it was", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const agent = fakeAgent();

    await build({ tracker: down() }).tick();
    later();
    const result = await build({ agent }).tick();

    // The state it was in when the dependency went down, and the move it was
    // going to make from there. Nothing was skipped and nothing was reset.
    expect(result).toMatchObject({ kind: "worked", from: "DISCOVERED", plan: "act" });
    expect(agent.triage).toHaveBeenCalledOnce();
    expect(records.load("PROJ-1239")?.triage?.clear).toBe(true);
    expect(queue.pending()[0]?.attempt).toBe(0);
  });

  it("says nothing about recovery when nothing had failed", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build().tick();

    expect(notifier.sent).toEqual([]);
    expect(log.of("work.recovered")).toEqual([]);
  });

  it("does not read a park as a recovery", async () => {
    // A ticket already failing, whose next move would spend an agent, against
    // a budget with no room. The park carries the attempt count, so the tick
    // after it must not announce a recovery that never happened.
    records.save({ ...newRecordAt("PROJ-1239", clock), state: "IMPLEMENTING" });
    queue.enqueue({ workId: "PROJ-1239", reason: "retrying", attempt: 2 }, clock);

    const spent = new RecordingEventLog();
    spent.append({
      at: clock.toISOString(),
      kind: "agent.run",
      workId: "PROJ-1239",
      state: "IMPLEMENTING",
      detail: {
        harness: "claude",
        model: "claude-opus-5",
        outcome: "completed",
        durationMs: 10,
        costSource: "reported",
        costUsd: 19,
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      },
    });
    const budget = new LogBudget(spent, { stopAt: 0.9, perFiveHours: { costUsd: 20 } });

    const result = await build({ budget }).tick();

    expect(result).toMatchObject({ kind: "parked" });
    expect(notifier.sent).toEqual([]);
    expect(log.of("work.recovered")).toEqual([]);
    expect(queue.pending()[0]?.attempt).toBe(2);
  });

  it("announces once at the ceiling, and the ceiling wins over the fall", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    // maxItemAttempts of one means the first failure is also the last, and
    // that has to read as one warning rather than two.
    await build({ tracker: down(), config: { ...workerConfig, maxItemAttempts: 1 } }).tick();

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toContain("is off the queue");
    expect(log.of("work.degraded")).toEqual([]);
    expect(queue.pending()).toHaveLength(0);
  });

  it("says nothing about a recovery that a person made", async () => {
    // Past the ceiling the item leaves the queue, and the next one comes from
    // `amy discover` at attempt zero. Nothing carries the history, which is
    // correct: the repair was somebody else's.
    queue.enqueue(
      { workId: "PROJ-1239", reason: "retrying", attempt: workerConfig.maxItemAttempts - 1 },
      clock,
    );
    await build({ tracker: down() }).tick();

    queue.enqueue({ workId: "PROJ-1239", reason: "found in the working status" }, clock);
    await build().tick();

    expect(notifier.sent).toHaveLength(1);
    expect(log.of("work.recovered")).toEqual([]);
  });
});

/** A fresh record, without importing the workflow's factory into the fixture. */
function newRecordAt(id: string, at: Date) {
  return {
    id,
    state: "DISCOVERED" as const,
    attempts: {},
    judged: [],
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  };
}
