import fs from "node:fs";
import path from "node:path";
import { Store, WorkRecord, takeLock, writeAtomically } from "@amykit/core";

/** How long a write may take before the lock is judged abandoned. */
const LOCK_LEASE_MS = 10_000;
/** How long one turn of waiting for another writer costs before it is asked again. */
const LOCK_PAUSE_MS = 2;

/** One file per ticket, so a record can be read and edited by hand. */
export class FileStore<R extends { id: string } = WorkRecord> implements Store<R> {
  /** What each record looked like when this writer read it, as text. */
  private readonly read = new Map<string, string>();

  constructor(private readonly root: string, create = true) {
    if (create) fs.mkdirSync(this.root, { recursive: true });
  }

  load(workId: string): R | null {
    const text = this.readFile(workId);
    if (text === undefined) return null;
    this.read.set(workId, text);
    return JSON.parse(text) as R;
  }

  save(record: R): void {
    // Under the record's own lock: a save and a look that read the same
    // record would otherwise write back two versions of it, and whichever
    // renamed last would erase the other's move.
    this.underLock(record.id, () => this.write(record));
  }

  update(workId: string, change: (record: R) => R | undefined): R | null {
    return this.underLock(workId, () => {
      const record = this.load(workId);
      if (record === null) return null;
      const next = change(record);
      if (next !== undefined) this.write(next);
      return next ?? record;
    });
  }

  all(): R[] {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(this.root, name), "utf-8")) as R);
  }

  /**
   * Written to a name of its own and renamed into place, so a crash
   * mid-write cannot leave a half-written record that fails to parse on the
   * next look, and two writers never share a staged name.
   */
  private write(record: R): void {
    const text = JSON.stringify(this.keepingTheRelease(record), null, 2);
    writeAtomically(this.file(record.id), text);
    this.read.set(record.id, text);
  }

  /**
   * The record with a release another process made since this writer read it
   * kept clear.
   *
   * The engine loads a record, works on it for as long as an agent takes, and
   * saves the state it planned from. A `gaveUp` an operator cleared meanwhile
   * is a decision it never saw, and writing this copy back would undo it.
   */
  private keepingTheRelease(record: R): R {
    const before = this.read.get(record.id);
    const wasMarked = before === undefined ? undefined : gaveUpOf(JSON.parse(before));
    if (wasMarked === undefined) return record;
    const onDisk = this.readFile(record.id);
    if (onDisk === undefined || gaveUpOf(JSON.parse(onDisk)) !== undefined) return record;
    // Only when this writer did not decide the marker itself: a new `gaveUp`
    // is the engine giving up, and that is its to write.
    if (JSON.stringify(gaveUpOf(record)) !== JSON.stringify(wasMarked)) return record;
    const { gaveUp: _cleared, ...rest } = record as R & { gaveUp?: unknown };
    return rest as R;
  }

  /** A record's text as it stands, without changing what this writer is judged against. */
  private readFile(workId: string): string | undefined {
    try {
      return fs.readFileSync(this.file(workId), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  /**
   * Under the record's lock, for as long as a lock may legitimately be held.
   *
   * The lease is the only honest ceiling: past it the lock counts abandoned
   * and is taken over, so giving up sooner would fail a save beside a writer
   * that is still working — and the move it carries would be lost. A writer
   * that waited the whole lease has waited for every holder there can be.
   */
  private underLock<T>(workId: string, work: () => T): T {
    const lock = `${this.file(workId)}.lock`;
    const giveUpAt = Date.now() + LOCK_LEASE_MS;
    for (;;) {
      const held = takeLock(lock, { leaseMs: LOCK_LEASE_MS });
      if (held) {
        try {
          return work();
        } finally {
          held.release();
        }
      }
      if (Date.now() >= giveUpAt) {
        throw new Error(`could not take ${lock}: another writer held it for ${LOCK_LEASE_MS} ms`);
      }
      pause(LOCK_PAUSE_MS);
    }
  }

  private file(workId: string): string {
    return path.join(this.root, `${workId}.json`);
  }
}

/** A record's release marker, as read from a store that may keep any shape. */
function gaveUpOf(record: unknown): unknown {
  return (record as { gaveUp?: unknown }).gaveUp;
}

/** A synchronous wait, for the turns a held lock costs: this store's API is synchronous. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
