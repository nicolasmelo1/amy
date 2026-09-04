import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker, WorkerDeps } from "../src/Worker.js";
import { FileQueue } from "@amy/plugin-file-queue";
import { DEFAULT_POLICY } from "@amy/workflow-ticket-to-qa";
import { USES_ACTIONS, newRecord } from "@amy/workflow-ticket-to-qa";
import { HEAD, WORKDAY, botReview, pullRequest, roster, thread, ticket } from "@amy/test-fixtures";
import {
  InMemoryStore,
  RecordingNotifier,
  fakeAgent,
  fakeGate,
  fakeHost,
  fakeTracker,
  workerConfig,
} from "@amy/test-fixtures";

describe("Worker", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let notifier: RecordingNotifier;
  let clock: Date;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-worker-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
    notifier = new RecordingNotifier();
    clock = new Date(WORKDAY);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: Partial<WorkerDeps> = {}): Worker {
    return new Worker({
      queue,
      records,
      tracker: fakeTracker(),
      host: fakeHost(),
      agent: fakeAgent(),
      gate: fakeGate(),
      notifier,
      roster: () => roster(),
      now: () => clock,
      config: workerConfig,
      ...overrides,
    });
  }

  it("is idle when nothing is due", async () => {
    await expect(build().tick()).resolves.toEqual({ kind: "idle" });
  });

  it("is idle when the only item is held back", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "later", delayMs: 60_000 }, clock);

    await expect(build().tick()).resolves.toEqual({ kind: "idle" });
  });

  it("reads the ticket on the first look and stays put", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const agent = fakeAgent();

    const result = await build({ agent }).tick();

    expect(agent.triage).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ kind: "worked", from: "DISCOVERED", to: "DISCOVERED", plan: "act" });
  });

  it("chains the next look immediately after doing work", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build().tick();

    // No schedule involved: the successor is already due.
    expect(queue.ready(clock)).toHaveLength(1);
    expect(queue.running()).toHaveLength(0);
  });

  it("chains the next look behind the wait when it is holding", async () => {
    records.save({ ...newRecord("PROJ-1239", clock), state: "CLARIFYING" });
    queue.enqueue({ workId: "PROJ-1239", reason: "asked" }, clock);

    const result = await build().tick();

    expect(result).toMatchObject({ plan: "wait", retryAfterMs: DEFAULT_POLICY.pollBackoffMs });
    expect(queue.ready(clock)).toHaveLength(0);
    expect(queue.pending()).toHaveLength(1);
  });

  it("stops chaining once the ticket is settled", async () => {
    records.save({ ...newRecord("PROJ-1239", clock), state: "DONE" });
    queue.enqueue({ workId: "PROJ-1239", reason: "final look" }, clock);

    const result = await build().tick();

    expect(result).toMatchObject({ plan: "settled" });
    expect(queue.pending()).toHaveLength(0);
    expect(queue.running()).toHaveLength(0);
  });

  it("walks a ticket forward one move per tick", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const worker = build();

    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = await worker.tick();
      if (result.kind === "worked") seen.push(`${result.from}->${result.to}`);
    }

    expect(seen).toEqual([
      "DISCOVERED->DISCOVERED",
      "DISCOVERED->READY",
      "READY->IMPLEMENTING",
      "IMPLEMENTING->IMPLEMENTING",
    ]);
  });

  it("opens the pull request with the ticket id in the title and no body", async () => {
    records.save({
      ...newRecord("PROJ-1239", clock),
      state: "PR_OPEN",
    });
    queue.enqueue({ workId: "PROJ-1239", reason: "gate is green" }, clock);
    const host = fakeHost();

    await build({ host }).tick();

    expect(host.openPullRequest).toHaveBeenCalledWith({
      repo: "Northwind/northwind-backend",
      branch: "ada/proj-1239-total-is-wrong",
      title: "PROJ-1239: The total is wrong on the invoice",
      body: "",
    });
  });

  it("only counts review load when it is about to pick a reviewer", async () => {
    records.save({ ...newRecord("PROJ-1239", clock), state: "CLARIFYING" });
    queue.enqueue({ workId: "PROJ-1239", reason: "waiting" }, clock);
    const host = fakeHost();

    await build({ host }).tick();

    expect(host.reviewLoad).not.toHaveBeenCalled();
  });

  it("counts review load and asks the lightest reviewer", async () => {
    records.save({
      ...newRecord("PROJ-1239", clock),
      state: "REVIEWER_ASSIGNED",
      pullRequestNumber: 4940,
    });
    queue.enqueue({ workId: "PROJ-1239", reason: "bot is done" }, clock);
    const host = fakeHost(pullRequest(), {
      reviewLoad: vi.fn().mockResolvedValue({ "ada": 5, alan: 1, edsger: 3 }),
    });

    await build({ host }).tick();

    expect(host.reviewLoad).toHaveBeenCalledWith(["Northwind/northwind-backend"]);
    expect(host.requestReview).toHaveBeenCalledWith(
      "Northwind/northwind-backend",
      4940,
      "alan",
    );
    expect(records.load("PROJ-1239")?.reviewer).toBe("alan");
  });

  it("hands the ticket to QA by moving it and reassigning it", async () => {
    records.save({ ...newRecord("PROJ-1239", clock), state: "QA_HANDOFF" });
    queue.enqueue({ workId: "PROJ-1239", reason: "approved" }, clock);
    const tracker = fakeTracker();

    await build({ tracker }).tick();

    expect(tracker.setStatus).toHaveBeenCalledWith("PROJ-1239", "In QA");
    expect(tracker.assign).toHaveBeenCalledWith("PROJ-1239", "grace@example.test");
    expect(records.load("PROJ-1239")?.state).toBe("DONE");
  });

  it("posts the questions on the ticket and tells the operator", async () => {
    records.save({
      ...newRecord("PROJ-1239", clock),
      state: "DISCOVERED",
      triage: { clear: false, questions: ["Does a write-off reduce the balance?"], at: clock.toISOString() },
    });
    queue.enqueue({ workId: "PROJ-1239", reason: "read" }, clock);
    const tracker = fakeTracker();

    await build({ tracker }).tick();

    expect(tracker.comment).toHaveBeenCalledWith(
      "PROJ-1239",
      "- Does a write-off reduce the balance?",
    );
    expect(notifier.sent[0]).toContain("needs an answer");
  });

  it("opens a follow-up ticket when a review comment needs the owner", async () => {
    records.save({
      ...newRecord("PROJ-1239", clock),
      state: "HUMAN_FIX",
      reviewer: "edsger",
      judged: [{ threadId: "T1", verdict: "disagreed", note: "the types already prove this" }],
    });
    queue.enqueue({ workId: "PROJ-1239", reason: "judged" }, clock);
    const tracker = fakeTracker();
    const host = fakeHost(pullRequest({ threads: [thread()] }));

    await build({ tracker, host }).tick();

    expect(tracker.createFollowUp).toHaveBeenCalledWith({
      parentTicketId: "PROJ-1239",
      title: "FUP PROJ-1239: review comments need a decision",
      body: "T1: the types already prove this",
    });
    expect(records.load("PROJ-1239")?.escalation?.followUpTicketId).toBe("PROJ-9999");
    expect(notifier.sent[0]).toContain("PROJ-9999");
  });

  it("gives the agent only the threads it was asked to judge", async () => {
    records.save({ ...newRecord("PROJ-1239", clock), state: "COPILOT_FIX" });
    queue.enqueue({ workId: "PROJ-1239", reason: "bot found things" }, clock);
    const agent = fakeAgent();
    const host = fakeHost(
      pullRequest({
        reviews: [botReview(HEAD)],
        threads: [
          thread({ id: "B1", author: "copilot-pull-request-reviewer" }),
          thread({ id: "H1", author: "edsger" }),
        ],
      }),
    );

    await build({ agent, host }).tick();

    const [, threads, from] = (agent.addressThreads as any).mock.calls[0];
    expect(threads.map((t: { id: string }) => t.id)).toEqual(["B1"]);
    expect(from).toBe("automated");
  });

  it("retries after an error, behind a backoff", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const agent = fakeAgent({ triage: vi.fn().mockRejectedValue(new Error("the agent died")) });

    const result = await build({ agent }).tick();

    expect(result).toMatchObject({ kind: "failed", error: "the agent died" });
    expect(queue.ready(clock)).toHaveLength(0);
    expect(queue.pending()).toHaveLength(1);
    expect(queue.pending()[0]?.attempt).toBe(1);
  });

  it("stops retrying and tells the operator once it has tried enough", async () => {
    queue.enqueue(
      { workId: "PROJ-1239", reason: "retrying", attempt: workerConfig.maxItemAttempts - 1 },
      clock,
    );
    const agent = fakeAgent({ triage: vi.fn().mockRejectedValue(new Error("still dead")) });

    await build({ agent }).tick();

    expect(queue.pending()).toHaveLength(0);
    // Exactly one, so the ceiling can never quietly become two warnings:
    // this item had already failed, so the fall was announced ticks ago.
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toContain("is off the queue");
  });

  it("fails loudly when the ticket has left the tracker", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    const tracker = fakeTracker({ get: vi.fn().mockResolvedValue(null) });

    await expect(build({ tracker }).tick()).resolves.toMatchObject({
      kind: "failed",
      error: "PROJ-1239 is not in the tracker any more",
    });
  });

  it("sweeps finished queue items as it goes", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "old work" }, clock);
    queue.complete(queue.claim(clock)!);
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    clock = new Date(WORKDAY.getTime() + 40 * 24 * 60 * 60 * 1000);
    await build().tick();

    expect(queue.completed()).toHaveLength(0);
  });
});

describe("Worker.discover", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-discover-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(tracker = fakeTracker()): Worker {
    return new Worker({
      queue,
      records,
      tracker,
      host: fakeHost(),
      agent: fakeAgent(),
      gate: fakeGate(),
      notifier: new RecordingNotifier(),
      roster: () => roster(),
      now: () => WORKDAY,
      config: workerConfig,
    });
  }

  it("queues every ticket in the working status", async () => {
    const tracker = fakeTracker({
      inProgress: vi.fn().mockResolvedValue([ticket({ id: "PROJ-1239" }), ticket({ id: "PROJ-1201" })]),
    });

    await expect(build(tracker).discover()).resolves.toEqual(["PROJ-1239", "PROJ-1201"]);
  });

  it("does not queue a ticket that is already finished", async () => {
    records.save({ ...newRecord("PROJ-1239", WORKDAY), state: "DONE" });

    await expect(build().discover()).resolves.toEqual([]);
  });

  it("does not queue a ticket twice", async () => {
    const worker = build();

    await worker.discover();

    await expect(worker.discover()).resolves.toEqual([]);
    expect(queue.pending()).toHaveLength(1);
  });
});

describe("Worker.missingActions", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-actions-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: Partial<WorkerDeps> = {}): Worker {
    return new Worker({
      queue: new FileQueue(path.join(root, "queue")),
      records: new InMemoryStore(),
      tracker: fakeTracker(),
      host: fakeHost(),
      agent: fakeAgent(),
      gate: fakeGate(),
      notifier: new RecordingNotifier(),
      roster: () => roster(),
      now: () => WORKDAY,
      config: workerConfig,
      ...overrides,
    });
  }

  it("finds nothing missing for the workflow it was built for", () => {
    expect(build().missingActions([...USES_ACTIONS])).toEqual([]);
  });

  it("names an action nothing can run, rather than failing mid-ticket", () => {
    // This is what the open action name costs, and where the cost is paid:
    // at boot, by name, instead of halfway through somebody's ticket.
    expect(build().missingActions(["check-web-browser"])).toEqual(["check-web-browser"]);
  });

  it("names a core action whose port was never mounted", () => {
    const withoutGate = build({ gate: undefined as never });

    expect(withoutGate.missingActions(["run-gate"])).toEqual(["run-gate"]);
    expect(withoutGate.missingActions(["triage"])).toEqual([]);
  });
});
