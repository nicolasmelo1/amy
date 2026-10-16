import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FoundWork, WorkflowRuntime } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { InMemoryStore, WORKDAY, ticketWorkerDeps } from "@amykit/test-fixtures";
import { Worker } from "../src/Worker.js";

/**
 * Urgency is the source's fact, read at discovery. The engine carries it to
 * the queue on the first look, refreshes it on every later discovery, and
 * keeps it on every look it chains — it never decides one.
 */
describe("Worker.discover, with urgency", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  let found: (string | FoundWork)[];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-discover-priority-"));
    queue = new FileQueue(path.join(root, "queue"), "priority");
    records = new InMemoryStore();
    found = [];
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const runtime: WorkflowRuntime = {
    policy: {},
    found: async () => found,
    newRecord: (id, at) => ({ id, state: "NEW", updatedAt: at.toISOString(), attempts: {}, history: [] }),
    observe: async () => ({}),
    actions: {},
    apply: (record) => record,
  };

  const build = () =>
    new Worker({
      queue,
      records,
      ...ticketWorkerDeps({ now: () => WORKDAY, plan: (() => ({ kind: "wait", why: "nothing yet", retryAfterMs: 1000 })) as never }),
      runtime,
    });

  it("queues what it found with the urgency the source reported", async () => {
    found = [{ workId: "LOW", priority: 4 }, { workId: "URGENT", priority: 1 }, "PLAIN"];

    await build().discover();

    expect(Object.fromEntries(queue.pending().map((item) => [item.workId, item.priority]))).toEqual({
      LOW: 4,
      URGENT: 1,
      PLAIN: undefined,
    });
    expect(queue.claim(WORKDAY)?.workId).toBe("URGENT");
  });

  it("refreshes the urgency of work already waiting rather than queueing it twice", async () => {
    found = [{ workId: "A", priority: 3 }];
    const worker = build();
    await worker.discover();

    found = [{ workId: "A", priority: 1 }];
    await expect(worker.discover()).resolves.toEqual([]);

    expect(queue.pending()).toHaveLength(1);
    expect(queue.pending()[0]?.priority).toBe(1);
  });

  it("keeps the urgency on the look it chains", async () => {
    found = [{ workId: "A", priority: 2 }];
    const worker = build();
    await worker.discover();

    await worker.tick();

    expect(queue.pending()).toHaveLength(1);
    expect(queue.pending()[0]?.priority).toBe(2);
  });
});
