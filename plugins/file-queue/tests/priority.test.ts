import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "../src/FileQueue.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const SECOND = 1000;
const later = (seconds: number) => new Date(NOW.getTime() + seconds * SECOND);

describe("FileQueue ordered by priority", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const claimAll = (queue: FileQueue, at: Date) => {
    const order: string[] = [];
    for (let item = queue.claim(at); item; item = queue.claim(at)) order.push(item.workId);
    return order;
  };

  it("claims the most urgent due item first", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "LOW", reason: "found", priority: 4 }, NOW);
    queue.enqueue({ workId: "URGENT", reason: "found", priority: 1 }, later(1));
    queue.enqueue({ workId: "NONE", reason: "found" }, later(2));
    queue.enqueue({ workId: "HIGH", reason: "found", priority: 2 }, later(3));

    expect(claimAll(queue, later(10))).toEqual(["URGENT", "HIGH", "LOW", "NONE"]);
  });

  it("is first in, first out within one priority", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "FIRST", reason: "found", priority: 2 }, NOW);
    queue.enqueue({ workId: "SECOND", reason: "found", priority: 2 }, later(1));
    queue.enqueue({ workId: "THIRD", reason: "found", priority: 2 }, later(2));

    expect(claimAll(queue, later(10))).toEqual(["FIRST", "SECOND", "THIRD"]);
  });

  it("never hands out an urgent item before it is due", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "URGENT", reason: "waiting", priority: 1, delayMs: 60 * SECOND }, NOW);
    queue.enqueue({ workId: "LOW", reason: "found", priority: 4 }, NOW);

    expect(claimAll(queue, later(1))).toEqual(["LOW"]);
  });

  it("reorders what is waiting when a priority is refreshed", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 2 }, NOW);
    queue.enqueue({ workId: "B", reason: "found", priority: 3 }, later(1));

    expect(queue.reprioritize("B", 1)).toBe(1);
    expect(queue.reprioritize("B", 1)).toBe(0);

    expect(claimAll(queue, later(10))).toEqual(["B", "A"]);
  });

  it("can drop a priority, which puts the item behind every one that has one", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 1 }, NOW);
    queue.enqueue({ workId: "B", reason: "found", priority: 3 }, later(1));

    queue.reprioritize("A", undefined);

    expect(queue.pending().find((item) => item.workId === "A")).not.toHaveProperty("priority");
    expect(claimAll(queue, later(10))).toEqual(["B", "A"]);
  });

  it("keeps a priority across a promotion and a restart", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "waiting", priority: 1, delayMs: 60 * SECOND }, NOW);
    queue.enqueue({ workId: "B", reason: "found", priority: 2 }, NOW);
    queue.promote("A", later(1));

    expect(claimAll(new FileQueue(root, "priority"), later(2))).toEqual(["A", "B"]);
  });

  it("keeps id order without the option, whatever the priorities say", () => {
    const queue = new FileQueue(root);
    queue.enqueue({ workId: "LOW", reason: "found", priority: 4 }, NOW);
    queue.enqueue({ workId: "URGENT", reason: "found", priority: 1 }, later(1));

    expect(claimAll(queue, later(10))).toEqual(["LOW", "URGENT"]);
  });
});
