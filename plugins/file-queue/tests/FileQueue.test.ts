import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "../src/FileQueue.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

describe("FileQueue", () => {
  let root: string;
  let queue: FileQueue;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-queue-"));
    queue = new FileQueue(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("hands out an item that is due immediately", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, NOW);

    const claimed = queue.claim(NOW);

    expect(claimed?.workId).toBe("PROJ-1239");
    expect(claimed?.reason).toBe("discovered");
  });

  it("holds an item back until it is due", () => {
    queue.enqueue(
      { workId: "PROJ-1239", reason: "waiting on review", delayMs: 5 * MINUTE },
      NOW,
    );

    expect(queue.claim(NOW)).toBeNull();
    expect(queue.claim(new Date(NOW.getTime() + 5 * MINUTE))).not.toBeNull();
  });

  it("tells an empty queue apart from a queue with nothing due", () => {
    expect(queue.pending()).toHaveLength(0);

    queue.enqueue({ workId: "PROJ-1239", reason: "later", delayMs: MINUTE }, NOW);

    expect(queue.claim(NOW)).toBeNull();
    expect(queue.pending()).toHaveLength(1);
  });

  it("hands out the item that became due first", () => {
    const later = new Date(NOW.getTime() + 10 * MINUTE);
    queue.enqueue({ workId: "LATE", reason: "b", delayMs: 5 * MINUTE }, NOW);
    queue.enqueue({ workId: "EARLY", reason: "a" }, NOW);

    expect(queue.claim(later)?.workId).toBe("EARLY");
    expect(queue.claim(later)?.workId).toBe("LATE");
  });

  it("cannot hand the same item to two workers", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "once" }, NOW);

    expect(queue.claim(NOW)).not.toBeNull();
    expect(queue.claim(NOW)).toBeNull();
  });

  it("chains the next look from the look that just finished", () => {
    // This is the whole point: no schedule decides when the next step runs.
    const first = queue.enqueue({ workId: "PROJ-1239", reason: "implement" }, NOW);
    const claimed = queue.claim(NOW);
    expect(claimed?.id).toBe(first.id);

    const anHourLater = new Date(NOW.getTime() + 60 * MINUTE);
    queue.complete(claimed!);
    queue.enqueue({ workId: "PROJ-1239", reason: "run the gate" }, anHourLater);

    expect(queue.claim(anHourLater)?.reason).toBe("run the gate");
  });

  it("keeps a completed item out of the ready set", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "done with this" }, NOW);
    const claimed = queue.claim(NOW)!;

    queue.complete(claimed);

    expect(queue.pending()).toHaveLength(0);
    expect(queue.completed()).toHaveLength(1);
    expect(queue.running()).toHaveLength(0);
  });

  it("puts a released item back so it can be claimed again", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "retry me" }, NOW);
    const claimed = queue.claim(NOW)!;

    queue.release(claimed);

    expect(queue.claim(NOW)?.id).toBe(claimed.id);
  });

  it("recovers an item a dead worker left claimed", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "abandoned" }, NOW);
    queue.claim(NOW);

    const muchLater = new Date(Date.now() + 60 * MINUTE);
    const recovered = queue.recover(30 * MINUTE, muchLater);

    expect(recovered).toHaveLength(1);
    expect(queue.running()).toHaveLength(0);
    expect(queue.claim(muchLater)).not.toBeNull();
  });

  it("leaves a freshly claimed item alone when recovering", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "in flight" }, NOW);
    queue.claim(NOW);

    expect(queue.recover(30 * MINUTE, new Date())).toHaveLength(0);
    expect(queue.running()).toHaveLength(1);
  });

  it("prunes finished items past their retention", () => {
    queue.enqueue({ workId: "OLD", reason: "ancient" }, NOW);
    queue.complete(queue.claim(NOW)!);

    const removed = queue.prune(7, new Date(Date.now() + 30 * DAY));

    expect(removed).toBe(1);
    expect(queue.completed()).toHaveLength(0);
  });

  it("keeps finished items inside their retention", () => {
    queue.enqueue({ workId: "RECENT", reason: "yesterday" }, NOW);
    queue.complete(queue.claim(NOW)!);

    expect(queue.prune(7, new Date())).toBe(0);
    expect(queue.completed()).toHaveLength(1);
  });

  it("never prunes work that has not finished", () => {
    queue.enqueue({ workId: "PENDING", reason: "still queued" }, NOW);
    queue.enqueue({ workId: "RUNNING", reason: "in flight" }, NOW);
    queue.claim(NOW);

    queue.prune(0, new Date(Date.now() + DAY));

    expect(queue.pending().length + queue.running().length).toBe(2);
  });

  it("survives being reopened on the same directory", () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "persisted" }, NOW);

    const reopened = new FileQueue(root);

    expect(reopened.claim(NOW)?.workId).toBe("PROJ-1239");
  });
});
