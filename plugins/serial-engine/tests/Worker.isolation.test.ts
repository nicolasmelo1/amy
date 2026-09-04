import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker, WorkerDeps } from "../src/Worker.js";
import { FileQueue } from "@amy/plugin-file-queue";
import { WORKDAY, roster } from "@amy/test-fixtures";
import {
  InMemoryStore,
  RecordingEventLog,
  RecordingNotifier,
  ThrowingEventLog,
  ThrowingNotifier,
  fakeAgent,
  fakeGate,
  fakeHost,
  fakeTracker,
  workerConfig,
} from "@amy/test-fixtures";

/**
 * A plugin that dies does not bring the tick down, and the line is drawn at
 * one question: could swallowing this failure make the saved record a lie?
 * Only the notifier and the log answer no.
 */
describe("a broken notifier and a broken log", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let log: RecordingEventLog;
  let clock: Date;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-isolation-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    log = new RecordingEventLog();
    clock = new Date(WORKDAY);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function build(overrides: Partial<WorkerDeps> = {}): Worker {
    return new Worker({
      queue,
      records,
      tracker: fakeTracker(),
      host: fakeHost(),
      agent: fakeAgent(),
      gate: fakeGate(),
      notifier: new RecordingNotifier(),
      roster: () => roster(),
      now: () => clock,
      config: workerConfig,
      log,
      ...overrides,
    });
  }

  /** A plan whose only action is to say something, so the notifier is what runs. */
  const announcing = () => ({
    kind: "act" as const,
    why: "asking the operator",
    effects: [{ type: "announce" as const, text: "PROJ-1239 wants a look" }],
  });

  it("finishes the tick when the only channel throws", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    const result = await build({
      notifier: new ThrowingNotifier(),
      decide: announcing,
    }).tick();

    expect(result).toMatchObject({ kind: "worked" });
  });

  it("records the notification it could not send", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ notifier: new ThrowingNotifier(), decide: announcing }).tick();

    const [failed] = log.of("notify.failed");
    expect(failed?.workId).toBe("PROJ-1239");
    expect(failed?.detail).toMatchObject({ text: "PROJ-1239 wants a look" });
    expect(String(failed?.detail?.error)).toContain("disk is full");
  });

  it("still saves the move the announcement was about", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ notifier: new ThrowingNotifier(), decide: announcing }).tick();

    expect(records.load("PROJ-1239")).not.toBeNull();
  });

  it("keeps the ticket on the queue when the ceiling announcement throws", async () => {
    queue.enqueue(
      { workId: "PROJ-1239", reason: "retrying", attempt: workerConfig.maxItemAttempts - 1 },
      clock,
    );
    const agent = fakeAgent({ triage: vi.fn().mockRejectedValue(new Error("still dead")) });
    const notifier = new ThrowingNotifier();

    // The item is completed before the ceiling is announced, so an
    // announcement that threw past `tick()` used to take the ticket off the
    // queue with nothing saying why.
    const result = await build({ agent, notifier }).tick();

    expect(result).toMatchObject({ kind: "failed" });
    expect(log.of("notify.failed")).toHaveLength(1);
  });

  it("finishes the tick when the log cannot be written", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await build({ log: new ThrowingEventLog() }).tick();

    expect(result).toMatchObject({ kind: "worked" });
  });

  it("says the log is broken once, not once per line", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new ThrowingEventLog();

    await build({ log: broken }).tick();

    // Many attempts, one complaint: a log that throws on every call would
    // otherwise flood stderr, which is an outage of its own.
    expect(broken.attempts).toBeGreaterThan(1);
    expect(said).toHaveBeenCalledTimes(1);
    expect(said.mock.calls[0]?.[0]).toContain("carrying on without it");
  });

  it("does not try to announce that the log is broken", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notifier = new RecordingNotifier();

    await build({ log: new ThrowingEventLog(), notifier }).tick();

    // `announce` writes under `.amy/` too, so on a machine whose log just
    // broke it is the wrong thing to reach for.
    expect(notifier.sent).toEqual([]);
  });
});
