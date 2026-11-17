import fs from "node:fs";
import path from "node:path";
import { Store, WorkRecord, takeLock, writeAtomically } from "@amykit/core";

/** How long a write may take before the lock is judged abandoned. */
const LOCK_LEASE_MS = 10_000;
/** How long a writer waits its turn, counted in turns rather than seconds. */
const LOCK_TURNS = 500;

/** One file per ticket, so a record can be read and edited by hand. */
export class FileStore<R extends WorkRecord = WorkRecord> implements Store<R> {
  constructor(private readonly root: string, create = true) {
    if (create) fs.mkdirSync(this.root, { recursive: true });
  }

  load(workId: string): R | null {
    const file = this.file(workId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as R;
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
    writeAtomically(this.file(record.id), JSON.stringify(record, null, 2));
  }

  private underLock<T>(workId: string, work: () => T): T {
    const lock = `${this.file(workId)}.lock`;
    for (let turn = 0; turn < LOCK_TURNS; turn += 1) {
      const held = takeLock(lock, { leaseMs: LOCK_LEASE_MS });
      if (held) {
        try {
          return work();
        } finally {
          held.release();
        }
      }
      pause(2);
    }
    throw new Error(`could not take ${lock}: another writer held it for ${LOCK_TURNS * 2} ms`);
  }

  private file(workId: string): string {
    return path.join(this.root, `${workId}.json`);
  }
}

/** A synchronous wait, for the turns a held lock costs: this store's API is synchronous. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
