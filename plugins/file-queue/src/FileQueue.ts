import fs from "node:fs";
import path from "node:path";
import { EnqueueRequest, Queue } from "@amykit/core";
import { QueueItem, isReady } from "@amykit/core";

const READY = "ready";
const RUNNING = "running";
const DONE = "done";

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
 */
export class FileQueue implements Queue {
  private sequence = 0;

  constructor(private readonly root: string) {
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
    };

    this.write(READY, item);
    return item;
  }

  claim(now: Date): QueueItem | null {
    // Item ids begin with the instant they became due, so the earliest due
    // item is simply the first name in sorted order.
    const due = this.ready(now).sort((a, b) => a.id.localeCompare(b.id));
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
      this.enqueue({ workId, reason: item.reason, attempt: item.attempt }, now);
      moved += 1;
    }

    return moved;
  }

  recover(olderThanMs: number, now: Date): QueueItem[] {
    const stale: QueueItem[] = [];

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

  pending(): QueueItem[] {
    return this.read(READY);
  }

  running(): QueueItem[] {
    return this.read(RUNNING);
  }

  completed(): QueueItem[] {
    return this.read(DONE);
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

    return fs
      .readdirSync(full)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(full, name), "utf-8")) as QueueItem);
  }
}

/** A sortable, filename-safe instant. */
function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "");
}
