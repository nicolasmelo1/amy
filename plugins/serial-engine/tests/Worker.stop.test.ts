import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "../src/Worker.js";
import { FileQueue } from "@amy/plugin-file-queue";
import { WORKDAY,
  TicketWorkerOverrides,
} from "@amy/test-fixtures";
import {
  ticketWorkerDeps,
  FakeStopSwitch,
  agentResult,
  InMemoryStore,
  RecordingEventLog,
  fakeAgent,
  fakeTracker,
} from "@amy/test-fixtures";

describe("the handbrake", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let log: RecordingEventLog;
  let stop: FakeStopSwitch;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-stop-engine-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    log = new RecordingEventLog();
    stop = new FakeStopSwitch();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: TicketWorkerOverrides = {}): Worker {
    return new Worker({
      queue,
      records,
      ...ticketWorkerDeps({
        now: () => WORKDAY,
        log,
        stop,
        ...overrides,
      }),
    });
  }

  it("claims nothing while a stop is in force", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    stop.request("the gate keeps failing");

    const result = await build().tick();

    expect(result).toEqual({ kind: "stopped", reason: "the gate keeps failing" });
    // The item is still there, untouched, so releasing picks it back up.
    expect(queue.ready(WORKDAY)).toHaveLength(1);
  });

  it("says in the log that it obeyed, and why", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    stop.request("out of budget");

    await build().tick();

    expect(log.of("stop.enforced")[0]?.detail).toEqual({ reason: "out of budget" });
  });

  it("picks up where it left off once released", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    const worker = build();
    stop.request("hold");

    await worker.tick();
    stop.clear();
    const result = await worker.tick();

    expect(result.kind).toBe("worked");
  });

  it("stops between the actions of one plan, not only between ticks", async () => {
    // A plan may carry several actions, and a brake that waits for the last
    // one arrives late. This workflow never emits a multi-action plan today,
    // so the decision is injected to reach the guard rather than pretend.
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    const tracker = fakeTracker({
      comment: vi.fn().mockImplementation(async () => {
        stop.request("pulled mid-plan");
      }),
    });

    await build({
      tracker,
      plan: () => ({
        kind: "act",
        why: "two actions, and the brake comes down after the first",
        effects: [{ type: "ask-question", questions: ["first"] }, { type: "run-gate" }],
      }),
    }).tick();

    expect(log.kinds()).toContain("stop.enforced");
    expect(log.of("stop.enforced")[0]?.detail).toMatchObject({
      reason: "pulled mid-plan",
      pending: "run-gate",
    });
    // The first action ran, the second never started.
    expect(log.of("action.started").map((e) => e.detail?.action)).toEqual(["ask-question"]);
  });

  it("runs perfectly well with no handbrake fitted", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    const result = await build({ stop: undefined }).tick();

    expect(result.kind).toBe("worked");
  });
});

describe("what the engine writes down", () => {
  let root: string;
  let queue: FileQueue;
  let log: RecordingEventLog;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-log-engine-"));
    queue = new FileQueue(path.join(root, "queue"));
    log = new RecordingEventLog();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: TicketWorkerOverrides = {}): Worker {
    return new Worker({
      queue,
      records: new InMemoryStore(),
      ...ticketWorkerDeps({
        now: () => WORKDAY,
        log,
        ...overrides,
      }),
    });
  }

  it("says nothing was due", async () => {
    await build().tick();

    expect(log.kinds()).toEqual(["run.idle"]);
  });

  it("records the claim, the decision and the action, in order", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    await build().tick();

    expect(log.kinds()).toEqual([
      "run.claimed",
      "work.planned",
      "action.started",
      "agent.run",
      "action.finished",
      "work.advanced",
    ]);
  });

  it("names the action that ran", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    await build().tick();

    expect(log.of("action.started")[0]?.detail).toEqual({ action: "triage" });
  });

  it("records what the workflow decided and why", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    await build().tick();

    expect(log.of("work.planned")[0]).toMatchObject({
      workId: "W-1",
      state: "DISCOVERED",
      detail: { plan: "act" },
    });
  });

  it("records a failed action with what went wrong", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    const agent = fakeAgent({ triage: vi.fn().mockRejectedValue(new Error("the agent died")) });

    await build({ agent }).tick();

    expect(log.of("action.failed")[0]?.detail).toEqual({
      action: "triage",
      error: "the agent died",
    });
    expect(log.kinds()).toContain("work.failed");
  });

  it("fails the action when every harness gave up, rather than storing a non-answer", async () => {
    // The relay has already tried every harness and model by the time this
    // result arrives, so there is nowhere left to go. Storing the empty
    // triage would park the ticket in CLARIFYING waiting for an answer to a
    // question that was never asked.
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    const records = new InMemoryStore();
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue(
        agentResult(
          { clear: false, questions: [], at: WORKDAY.toISOString() },
          { outcome: "rate-limited", harness: "codex", model: "gpt-5" },
        ),
      ),
    });

    await build({ agent }).tick();

    expect(log.of("action.failed")[0]?.detail?.error).toContain("rate-limited");
    // The cause survives into the failure, which is what tells the operator
    // it was a quota and not a bad ticket.
    expect(log.of("action.failed")[0]?.detail?.error).toContain("codex");
    expect(records.load("W-1")?.triage).toBeUndefined();
  });

  it("still records what the failed run cost, because it was spent either way", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue(
        agentResult(
          { clear: false, questions: [], at: WORKDAY.toISOString() },
          { outcome: "failed", harness: "claude", model: "opus", costUsd: 0.42, costSource: "reported" },
        ),
      ),
    });

    await build({ agent }).tick();

    expect(log.of("agent.run")[0]?.detail).toMatchObject({ outcome: "failed", costUsd: 0.42 });
  });

  it("runs perfectly well with no log fitted", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    await expect(build({ log: undefined }).tick()).resolves.toMatchObject({ kind: "worked" });
  });

  it("writes down what the agent run took, and where the money figure came from", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);

    await build().tick();

    // Everything the relay and the budget will need, in one line.
    expect(log.of("agent.run")[0]).toMatchObject({
      workId: "W-1",
      state: "DISCOVERED",
      detail: {
        harness: "fake",
        model: "fake-1",
        outcome: "completed",
        costSource: "reported",
        costUsd: 0.001,
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      },
    });
  });

  it("says nothing about cost when nothing measured it", async () => {
    queue.enqueue({ workId: "W-1", reason: "discovered" }, WORKDAY);
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue(
        agentResult(
          { clear: true, questions: [], at: WORKDAY.toISOString() },
          { costSource: "unknown", costUsd: undefined, tokens: undefined },
        ),
      ),
    });

    await build({ agent }).tick();

    const detail = log.of("agent.run")[0]?.detail ?? {};
    expect(detail.costSource).toBe("unknown");
    // Absent, not zero. Zero is a number a budget would happily spend.
    expect("costUsd" in detail).toBe(false);
    expect("tokens" in detail).toBe(false);
  });
});
