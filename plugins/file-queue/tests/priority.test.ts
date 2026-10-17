import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("FileQueue reprioritizing while a worker claims", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-race-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never brings back an item a worker claimed after it was listed", () => {
    const queue = new FileQueue(root, "priority");
    const worker = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);

    // The worst interleaving, made certain: the worker claims the item after
    // it was listed and read, at the instant it is about to be rewritten —
    // whether the rewrite takes it by rename or writes over it.
    let claimed: string | undefined;
    const claimFirst = () => {
      if (claimed !== undefined) return;
      claimed = "";
      claimed = worker.claim(later(10))?.workId ?? "";
    };
    const rename = fs.renameSync.bind(fs);
    const writeFile = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(".reprioritizing")) claimFirst();
      rename(from, to);
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(file).includes(`${path.sep}ready${path.sep}`) && String(file).endsWith(".json")) claimFirst();
      (writeFile as (...a: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync);

    const changed = queue.reprioritize("A", 1);
    vi.restoreAllMocks();

    expect(claimed).toBe("A");
    expect(changed).toBe(0);
    expect(queue.pending()).toEqual([]);
    expect(worker.claim(later(10))).toBeNull();
  });

  it("leaves no half-written item behind for a reader", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);

    queue.reprioritize("A", 1);

    expect(fs.readdirSync(path.join(root, "ready")).every((name) => name.endsWith(".json"))).toBe(true);
    expect(queue.pending()[0]?.priority).toBe(1);
  });
});

describe("FileQueue, a reprioritization that does not finish", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-crash-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("puts the original back when writing the replacement fails", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 3, delayMs: 60_000 }, NOW);
    const writeFile = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(file).endsWith(".next")) throw new Error("ENOSPC: no space left on device");
      (writeFile as (...a: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync);

    expect(() => queue.reprioritize("A", 1)).toThrow("ENOSPC");
    vi.restoreAllMocks();

    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 3, notBefore: later(60).toISOString() }]);
  });

  it("puts back an item a dead process held, once it is as old as an abandoned claim", () => {
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3, delayMs: 60_000 }, NOW);
    const file = path.join(root, "ready", `${item.id}.json`);
    // What a process that died between the two renames leaves behind.
    fs.renameSync(file, `${file}.reprioritizing`);
    fs.writeFileSync(`${file}.reprioritizing.next`, "{ half", "utf-8");
    expect(queue.pending()).toEqual([]);

    expect(queue.recover(30 * 60_000, NOW)).toEqual([]);
    expect(queue.pending()).toEqual([]);

    const recovered = queue.recover(30 * 60_000, new Date(Date.now() + 31 * 60_000));

    expect(recovered.map((r) => r.workId)).toEqual(["A"]);
    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 3, notBefore: later(60).toISOString() }]);
    expect(fs.readdirSync(path.join(root, "ready")).every((name) => name.endsWith(".json"))).toBe(true);
  });
});
