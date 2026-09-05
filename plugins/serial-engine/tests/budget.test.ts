import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Budget, BudgetDecision, LogBudget } from "@amy/core";
import { FileQueue } from "@amy/plugin-file-queue";
import { WORKDAY, record as recordIn,
  TicketWorkerOverrides,
} from "@amy/test-fixtures";
import {
  ticketWorkerDeps,
  InMemoryStore,
  RecordingEventLog,
  fakeAgent,
} from "@amy/test-fixtures";
import { Worker } from "../src/Worker.js";

const SPENT: BudgetDecision = {
  ok: false,
  window: "perFiveHours",
  measure: "tokens",
  used: 1_900_000,
  limit: 2_000_000,
  stopAt: 0.9,
  retryAfterMs: 60_000,
  reason: "the perFiveHours budget has spent 1900000 of its 2000000 tokens ceiling",
};

const refusing: Budget = { mayStart: () => SPENT };

describe("Worker, against a budget", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let log: RecordingEventLog;
  let clock: Date;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-budget-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    log = new RecordingEventLog();
    clock = new Date(WORKDAY);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: TicketWorkerOverrides = {}): Worker {
    return new Worker({
      queue,
      records,
      ...ticketWorkerDeps({
        now: () => clock,
        log,
        ...overrides,
      }),
    });
  }

  it("starts nothing that would spend an agent while the window is spent", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const agent = fakeAgent();

    const result = await build({ agent, budget: refusing }).tick();

    expect(result).toMatchObject({
      kind: "parked",
      workId: "PROJ-1239",
      state: "DISCOVERED",
      retryAfterMs: 60_000,
    });
    expect(agent.triage).not.toHaveBeenCalled();
  });

  it("parks the ticket instead of losing it", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ budget: refusing }).tick();

    // Still on the queue, held back until the window has room, and the
    // record was never touched: the ticket did not move, it waited.
    expect(queue.pending()).toHaveLength(1);
    expect(queue.ready(clock)).toHaveLength(0);
    expect(records.load("PROJ-1239")).toBeNull();
  });

  it("keeps the attempt count when it parks", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "retrying", attempt: 3 }, clock);

    await build({ budget: refusing }).tick();

    // A park is not a success, so it must not refill the retry budget the
    // failures already spent. It also must not read as a recovery later.
    expect(queue.pending()[0]?.attempt).toBe(3);
  });

  it("picks the same ticket up once the window has room again", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    await build({ budget: refusing }).tick();

    clock = new Date(clock.getTime() + 61_000);
    const result = await build().tick();

    expect(result).toMatchObject({ kind: "worked", workId: "PROJ-1239", from: "DISCOVERED" });
  });

  it("writes down which ceiling stopped it", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ budget: refusing }).tick();

    expect(log.of("budget.parked")[0]).toMatchObject({
      workId: "PROJ-1239",
      detail: { window: "perFiveHours", measure: "tokens", limit: 2_000_000, pending: ["triage"] },
    });
  });

  it("lets a move that spends nothing through on a spent budget", async () => {
    records.save(recordIn("READY"));
    queue.enqueue({ workId: "PROJ-1239", reason: "cleared" }, clock);

    const result = await build({ budget: refusing }).tick();

    // READY only moves the ticket along. A ceiling on agent spending has no
    // business stopping the moves that do not spend one.
    expect(result).toMatchObject({ kind: "worked", from: "READY", to: "IMPLEMENTING" });
    expect(log.of("budget.parked")).toHaveLength(0);
  });

  it("parks against a real ledger read from the log", async () => {
    // A whole `agent.run` line, not only the fields the ledger reads: the
    // event contract is what says what one looks like, and a seeded line
    // that skips the rest is not the line production writes.
    log.append({
      at: new Date(clock.getTime() - 60 * 60 * 1000).toISOString(),
      kind: "agent.run",
      workId: "PROJ-1239",
      state: "IMPLEMENTING",
      detail: {
        harness: "claude",
        model: "claude-opus-5",
        outcome: "completed",
        durationMs: 4000,
        costSource: "reported",
        costUsd: 19,
        tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    });
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    const budget = new LogBudget(log, { stopAt: 0.9, perFiveHours: { costUsd: 20 } });
    const result = await build({ budget }).tick();

    expect(result).toMatchObject({ kind: "parked", state: "DISCOVERED" });
  });
});
