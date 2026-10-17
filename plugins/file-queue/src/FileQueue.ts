import fs from "node:fs";
import path from "node:path";
import { EnqueueRequest, Queue } from "@amykit/core";
import { QueueItem, isReady } from "@amykit/core";

const READY = "ready";
const RUNNING = "running";
const DONE = "done";
/**
 * What an item held for reprioritizing is called while it is held, followed
 * by the instant the hold was taken.
 */
const HELD = ".reprioritizing.";

/**
 * A queue kept as one file per item.
 *
 * There is no fixed schedule anywhere in here. A ticket's next look is
 * enqueued by the look that precedes it, so a step that takes a minute and a
 * step that takes an hour both chain the moment they finish rather than
 * waiting for a tick that may be twenty minutes away.
 *
 * Claiming renames the file into `running/`. Rename is atomic on one
 * filesystem, so two workers cannot take the same item even though the
 * queue is only a directory.
 *
 * Due items are taken in id order — the instant each became due — unless
 * the queue was told to order by priority: then the most urgent due item
 * goes first, and id order breaks the tie, which is first in, first out
 * within one priority.
 */
export type QueueOrder = "id" | "priority";

export class FileQueue implements Queue {
  private sequence = 0;

  constructor(
    private readonly root: string,
    private readonly order: QueueOrder = "id",
  ) {
    for (const dir of [READY, RUNNING, DONE]) {
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    }
  }

  enqueue(request: EnqueueRequest, now: Date): QueueItem {
    const notBefore = new Date(now.getTime() + (request.delayMs ?? 0));
    this.sequence += 1;

    const item: QueueItem = {
      id: `${stamp(notBefore)}-${String(this.sequence).padStart(4, "0")}-${request.workId}`,
      workId: request.workId,
      enqueuedAt: now.toISOString(),
      notBefore: notBefore.toISOString(),
      attempt: request.attempt ?? 0,
      reason: request.reason,
      ...(request.priority !== undefined ? { priority: request.priority } : {}),
      ...(request.progress ? { progress: request.progress } : {}),
    };

    this.write(READY, item);
    return item;
  }

  claim(now: Date): QueueItem | null {
    // Item ids begin with the instant they became due, so the earliest due
    // item is simply the first name in sorted order.
    const due = this.ready(now).sort((a, b) => this.compare(a, b));
    const next = due[0];
    if (!next) return null;

    try {
      fs.renameSync(this.file(READY, next), this.file(RUNNING, next));
    } catch {
      // Another worker took it between the listing and the rename.
      return null;
    }

    return next;
  }

  complete(item: QueueItem): void {
    this.move(RUNNING, DONE, item);
  }

  release(item: QueueItem): void {
    this.move(RUNNING, READY, item);
  }

  promote(workId: string, now: Date): number {
    let moved = 0;

    for (const item of this.read(READY)) {
      if (item.workId !== workId) continue;
      if (isReady(item, now)) continue;

      // Written again rather than edited in place: an item's id begins with
      // the instant it becomes due, and `claim` picks the first name in
      // sorted order. Moving `notBefore` alone would leave a due item sorted
      // behind everything queued after it, so the thing brought forward would
      // be the last one looked at.
      fs.rmSync(this.file(READY, item));
      // Promotion is the operator's explicit release after changing the
      // world. A ceiling streak describes the old world, so it must not make
      // the released look park again before it can observe the new evidence.
      this.enqueue({ workId, reason: item.reason, attempt: item.attempt, priority: item.priority }, now);
      moved += 1;
    }

    return moved;
  }

  /**
   * Taken out of `ready/` by rename before it is rewritten, the same atomic
   * step `claim` takes: whichever of the two renames first owns the item,
   * and the other finds nothing. Rewriting in place could recreate a file a
   * worker had just claimed, and two workers would then run one look.
   *
   * While it is held, the held file is always a whole item — the original,
   * or the replacement renamed over it — so a failure puts back something
   * valid, and a process that dies holding it leaves something `recover`
   * can put back.
   */
  reprioritize(workId: string, priority: number | undefined): number {
    let changed = 0;

    for (const listed of this.read(READY)) {
      if (listed.workId !== workId || listed.priority === priority) continue;
      const file = this.file(READY, listed);
      // When the hold was taken is in its name, set by the same rename that
      // takes it: a file keeps the mtime it had while it waited, and an item
      // that waited long would read as abandoned the instant it was held.
      const held = `${file}${HELD}${Date.now()}`;
      try {
        fs.renameSync(file, held);
      } catch {
        // A worker claimed it between the listing and the rename.
        continue;
      }
      const next = `${held}.next`;
      try {
        const item = JSON.parse(fs.readFileSync(held, "utf-8")) as QueueItem;
        const { priority: _old, ...rest } = item;
        fs.writeFileSync(next, JSON.stringify(priority === undefined ? rest : { ...rest, priority }, null, 2), "utf-8");
        fs.renameSync(next, held);
      } finally {
        // A replacement that failed half-written goes first — and whether or
        // not that works, the original goes back where a claim can find it.
        try {
          fs.rmSync(next, { force: true });
        } finally {
          fs.renameSync(held, file);
        }
      }
      changed += 1;
    }

    return changed;
  }

  recover(olderThanMs: number, now: Date): QueueItem[] {
    const stale: QueueItem[] = [...this.restoreHeld(olderThanMs, now)];

    for (const item of this.read(RUNNING)) {
      const age = now.getTime() - fs.statSync(this.file(RUNNING, item)).mtimeMs;
      if (age >= olderThanMs) {
        this.release(item);
        stale.push(item);
      }
    }

    return stale;
  }

  prune(retentionDays: number, now: Date): number {
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const item of this.read(DONE)) {
      const file = this.file(DONE, item);
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.rmSync(file);
        removed += 1;
      }
    }

    return removed;
  }

  ready(now: Date): QueueItem[] {
    return this.read(READY).filter((item) => isReady(item, now));
  }

  /**
   * Every look still to come, the ones a reprioritization is holding
   * included: they are not claimable while held, but they exist, and a
   * discovery that did not see them would queue the same work a second time.
   *
   * One listing, and an item read under either of its two names: a hold or
   * its release can land between the listing and the read, and an item seen
   * in neither place would be one discovery queues again.
   */
  pending(): QueueItem[] {
    const dir = path.join(this.root, READY);
    if (!fs.existsSync(dir)) return [];
    const bases = new Set(
      fs.readdirSync(dir).flatMap((name) => {
        if (name.endsWith(".json")) return [name];
        const at = name.indexOf(HELD);
        return at === -1 || name.endsWith(".next") ? [] : [name.slice(0, at)];
      }),
    );
    return [...bases].flatMap((base) => {
      const item = this.readUnderEitherName(dir, base);
      return item ? [item] : [];
    });
  }

  /**
   * The item as `ready/` holds it, as itself or as a hold. A hold and its
   * release are renames, so a few tries see it in one of the two unless a
   * worker claimed it, which takes it out of what is still to come.
   */
  private readUnderEitherName(dir: string, base: string): QueueItem | null {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const direct = readItem(path.join(dir, base));
      if (direct) return direct;
      for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith(`${base}${HELD}`) || name.endsWith(".next")) continue;
        const held = readItem(path.join(dir, name));
        if (held) return held;
      }
    }
    return null;
  }

  running(): QueueItem[] {
    return this.read(RUNNING);
  }

  completed(): QueueItem[] {
    return this.read(DONE);
  }

  /**
   * Items a reprioritization held when its process died, put back once the
   * hold is as old as an abandoned claim, so a writer that is merely slow
   * keeps what it holds. The age is the hold's own — the instant in its name
   * — never the item's, which may have waited for hours before it was taken.
   * Its half-written replacement, if any, is dropped.
   */
  private restoreHeld(olderThanMs: number, now: Date): QueueItem[] {
    this.dropOrphanedReplacements(olderThanMs, now);
    const restored: QueueItem[] = [];
    for (const { held, takenAt } of this.holds()) {
      if (now.getTime() - takenAt < olderThanMs) continue;
      fs.rmSync(`${held}.next`, { force: true });
      // Read while it is still held: once it is back in `ready/`, a worker
      // may claim it before a second read, and that is not a failure.
      const item = readItem(held);
      if (!item) continue;
      try {
        fs.renameSync(held, held.slice(0, held.indexOf(HELD)));
      } catch (error) {
        // Its writer finished, or another recovery got there first.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      restored.push(item);
    }
    return restored;
  }

  /**
   * Half-written replacements whose hold is gone — the writer died after
   * releasing it, or a cleanup failed — once they are as old as an
   * abandoned claim. Nothing reads them, and nothing else would remove them.
   */
  private dropOrphanedReplacements(olderThanMs: number, now: Date): void {
    const dir = path.join(this.root, READY);
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".next")) continue;
      const replacement = path.join(dir, name);
      const hold = replacement.slice(0, -".next".length);
      const takenAt = Number(name.slice(name.indexOf(HELD) + HELD.length, -".next".length));
      if (fs.existsSync(hold) || !(now.getTime() - takenAt >= olderThanMs)) continue;
      fs.rmSync(replacement, { force: true });
    }
  }

  /** Every item a reprioritization is holding, and when it took each. */
  private holds(): { held: string; takenAt: number }[] {
    const dir = path.join(this.root, READY);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((name) => {
      const at = name.indexOf(HELD);
      if (at === -1 || name.endsWith(".next")) return [];
      const takenAt = Number(name.slice(at + HELD.length));
      return Number.isFinite(takenAt) ? [{ held: path.join(dir, name), takenAt }] : [];
    });
  }

  private compare(a: QueueItem, b: QueueItem): number {
    if (this.order === "priority") {
      const urgency = (a.priority ?? Infinity) - (b.priority ?? Infinity);
      if (urgency !== 0 && !Number.isNaN(urgency)) return urgency;
    }
    return a.id.localeCompare(b.id);
  }

  private file(dir: string, item: QueueItem): string {
    return path.join(this.root, dir, `${item.id}.json`);
  }

  private write(dir: string, item: QueueItem): void {
    fs.writeFileSync(this.file(dir, item), JSON.stringify(item, null, 2), "utf-8");
  }

  private move(from: string, to: string, item: QueueItem): void {
    fs.renameSync(this.file(from, item), this.file(to, item));
  }

  private read(dir: string): QueueItem[] {
    const full = path.join(this.root, dir);
    if (!fs.existsSync(full)) return [];

    // An item can leave between the listing and the read — another worker
    // claimed it — and an item that left is not one this listing holds.
    return fs
      .readdirSync(full)
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => {
        try {
          return [JSON.parse(fs.readFileSync(path.join(full, name), "utf-8")) as QueueItem];
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      });
  }
}

/** A sortable, filename-safe instant. */
function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "");
}

/** One item from its file, or null for a file that left before it was read. */
function readItem(file: string): QueueItem | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as QueueItem;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
