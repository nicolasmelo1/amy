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
      if (String(to).includes(".reprioritizing.")) claimFirst();
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
    const held = `${file}.reprioritizing.${Date.now()}`;
    fs.renameSync(file, held);
    fs.writeFileSync(`${held}.next`, "{ half", "utf-8");
    // Still there to discovery, and nobody can claim it while it is held.
    expect(queue.pending().map((p) => p.workId)).toEqual(["A"]);
    expect(queue.claim(later(120))).toBeNull();

    expect(queue.recover(30 * 60_000, new Date(Date.now() + 60_000))).toEqual([]);
    expect(queue.claim(later(120))).toBeNull();

    const recovered = queue.recover(30 * 60_000, new Date(Date.now() + 31 * 60_000));

    expect(recovered.map((r) => r.workId)).toEqual(["A"]);
    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 3, notBefore: later(60).toISOString() }]);
    expect(fs.readdirSync(path.join(root, "ready")).every((name) => name.endsWith(".json"))).toBe(true);
  });
});

describe("FileQueue, a hold on an item that had waited a long time", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-old-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("is never taken by recovery while its writer is still at work", () => {
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    // Waited an hour before anybody reprioritized it.
    const file = path.join(root, "ready", `${item.id}.json`);
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    fs.utimesSync(file, hourAgo, hourAgo);

    // Recovery runs at the worst moment: after the hold, before the rewrite.
    const recovery = new FileQueue(root, "priority");
    const writeFile = fs.writeFileSync.bind(fs);
    let recovered: unknown[] = [];
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(target).endsWith(".next")) recovered = recovery.recover(30 * 60_000, new Date());
      (writeFile as (...a: unknown[]) => void)(target, ...rest);
    }) as typeof fs.writeFileSync);

    expect(queue.reprioritize("A", 1)).toBe(1);
    vi.restoreAllMocks();

    expect(recovered).toEqual([]);
    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 1 }]);
  });
});

describe("FileQueue and discovery, after a reprioritization died", () => {
  it("does not let discovery queue the held work again", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-rediscover-"));
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const file = path.join(root, "ready", `${item.id}.json`);
    fs.renameSync(file, `${file}.reprioritizing.${Date.now()}`);

    // What discovery asks before it queues anything.
    expect(queue.pending().some((pending) => pending.workId === "A")).toBe(true);

    queue.recover(30 * 60_000, new Date(Date.now() + 31 * 60_000));
    expect(queue.pending().filter((pending) => pending.workId === "A")).toHaveLength(1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("FileQueue, an item between its two names", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-names-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("is still pending when a hold is taken between the listing and the read", () => {
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const file = path.join(root, "ready", `${item.id}.json`);
    const read = fs.readFileSync.bind(fs);
    let moved = false;
    vi.spyOn(fs, "readFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      // Another process takes the hold the moment this one goes to read it.
      if (!moved && String(target) === file) {
        moved = true;
        fs.renameSync(file, `${file}.reprioritizing.${Date.now()}`);
      }
      return (read as (...a: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.readFileSync);

    expect(queue.pending().map((pending) => pending.workId)).toEqual(["A"]);
  });

  it("is still pending when a hold is released between the listing and the read", () => {
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const file = path.join(root, "ready", `${item.id}.json`);
    const held = `${file}.reprioritizing.${Date.now()}`;
    fs.renameSync(file, held);
    const read = fs.readFileSync.bind(fs);
    let released = false;
    vi.spyOn(fs, "readFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (!released && String(target) === held) {
        released = true;
        fs.renameSync(held, file);
      }
      return (read as (...a: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.readFileSync);

    expect(queue.pending().map((pending) => pending.workId)).toEqual(["A"]);
  });

  it("survives a recovery whose restored item is claimed before it could be read again", () => {
    const queue = new FileQueue(root, "priority");
    const worker = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const file = path.join(root, "ready", `${item.id}.json`);
    fs.renameSync(file, `${file}.reprioritizing.${Date.now() - 60 * 60_000}`);
    const rename = fs.renameSync.bind(fs);
    let claimed: string | undefined;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      rename(from, to);
      // A worker claims it the instant it is back in ready/.
      if (claimed === undefined && String(to) === file) {
        claimed = "";
        claimed = worker.claim(later(10))?.workId ?? "";
      }
    });

    const recovered = queue.recover(30 * 60_000, new Date());

    expect(claimed).toBe("A");
    expect(recovered.map((r) => r.workId)).toEqual(["A"]);
  });
});

describe("FileQueue, a replacement that fails half-written", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-partial-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("leaves nothing behind in ready/ but the original", () => {
    const queue = new FileQueue(root, "priority");
    queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const writeFile = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(target).endsWith(".next")) {
        // The disk fills after part of it is written.
        (writeFile as (...a: unknown[]) => void)(target, "{ \"workId\": \"A\", ");
        throw new Error("ENOSPC: no space left on device");
      }
      (writeFile as (...a: unknown[]) => void)(target, ...rest);
    }) as typeof fs.writeFileSync);

    expect(() => queue.reprioritize("A", 1)).toThrow("ENOSPC");
    vi.restoreAllMocks();

    expect(fs.readdirSync(path.join(root, "ready")).every((name) => name.endsWith(".json"))).toBe(true);
    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 3 }]);
  });

  it("has recovery drop a replacement whose hold is already gone", () => {
    const queue = new FileQueue(root, "priority");
    const item = queue.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const orphan = path.join(root, "ready", `${item.id}.json.reprioritizing.${Date.now()}.next`);
    fs.writeFileSync(orphan, "{ half", "utf-8");

    queue.recover(30 * 60_000, new Date(Date.now() + 60_000));
    expect(fs.existsSync(orphan)).toBe(true);

    queue.recover(30 * 60_000, new Date(Date.now() + 31 * 60_000));
    expect(fs.existsSync(orphan)).toBe(false);
    expect(queue.pending()).toMatchObject([{ workId: "A", priority: 3 }]);
  });
});

describe("FileQueue, a claim racing a reprioritization", () => {
  it("returns the priority the item arrived in running/ with, not the one it was listed with", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-priority-claim-"));
    const worker = new FileQueue(root, "priority");
    const discovery = new FileQueue(root, "priority");
    worker.enqueue({ workId: "A", reason: "found", priority: 3 }, NOW);
    const rename = fs.renameSync.bind(fs);
    let refreshed = false;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      // Discovery finishes a refresh after the claim listed the item and
      // before its rename into running/.
      if (!refreshed && String(to).includes(`${path.sep}running${path.sep}`)) {
        refreshed = true;
        discovery.reprioritize("A", 1);
      }
      rename(from, to);
    });

    const claimed = worker.claim(later(10));
    vi.restoreAllMocks();

    expect(refreshed).toBe(true);
    expect(claimed?.priority).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
