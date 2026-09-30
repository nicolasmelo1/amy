import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { flock } from "fs-ext";
import { BriefId, BriefQuestion, BriefRecord, BriefStore } from "@amykit/core";

/**
 * Briefs on disk, one JSON file per brief under a directory the host chose.
 *
 * The layout is this adapter's own and nobody else's business: the CLI
 * resolves the port and reads the brief through it, so no caller ever needs
 * to know where the files live. A write goes to a sibling and is renamed
 * into place, so a crash mid-write cannot leave a half-written brief that
 * parses as something it is not.
 */
export class FileBriefStore implements BriefStore {
  private static readonly heldLocks = new Set<string>();

  constructor(private readonly root: string) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  async get(id: BriefId): Promise<BriefRecord | null> {
    const file = this.file(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as BriefRecord;
  }

  async write(input: {
    id: BriefId;
    sections: { name: string; body: string }[];
    explains: string[];
    at: string;
  }): Promise<BriefRecord> {
    return this.mutate(input.id, async (existing) => {
      const record: BriefRecord = {
        id: input.id,
        sections: input.sections,
        questions: existing?.questions ?? [],
        explains: input.explains,
        createdAt: existing?.createdAt ?? input.at,
        updatedAt: input.at,
        revision: (existing?.revision ?? 0) + 1,
      };
      this.save(record);
      return record;
    });
  }

  async appendQuestion(input: {
    id: BriefId;
    question: BriefQuestion;
    at: string;
  }): Promise<BriefRecord> {
    return this.mutate(input.id, async (existing) => {
      if (!existing) throw new Error(`there is no brief \`${input.id}\` to append a question to`);
      const record: BriefRecord = { ...existing, questions: [...existing.questions, input.question], updatedAt: input.at };
      this.save(record);
      return record;
    });
  }

  async retired(
    explainsAreTerminal: (workId: string) => boolean,
    retentionCutoffMs: number,
    now: Date,
  ): Promise<BriefId[]> {
    const retired: BriefId[] = [];
    for (const id of this.ids()) {
      const record = await this.get(id);
      if (!record || !record.explains.every(explainsAreTerminal)) continue;
      if (now.getTime() - new Date(record.updatedAt).getTime() < retentionCutoffMs) continue;
      retired.push(id);
    }
    return retired;
  }

  async remove(id: BriefId): Promise<void> {
    // The same lock as a writer, but nothing read: a brief too corrupt to
    // parse is exactly the one somebody needs to be able to clear.
    await this.locked(id, async () => fs.rmSync(this.file(id), { force: true }));
  }

  /** Written to a sibling and renamed, so a brief is never half-written. */
  private save(record: BriefRecord): void {
    const file = this.file(record.id);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
      fs.renameSync(temporary, file);
    } catch (error: unknown) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  /** Serializes a read-modify-write across phase processes for one brief. */
  private mutate<T>(id: BriefId, change: (existing: BriefRecord | null) => Promise<T>): Promise<T> {
    return this.locked(id, async () => change(await this.get(id)));
  }

  /** Holds one brief's lock across a callback, whatever it does with the file. */
  private async locked<T>(id: BriefId, work: () => Promise<T>): Promise<T> {
    const lock = `${this.file(id)}.lock`;
    const descriptor = await this.acquire(lock);
    try {
      return await work();
    } finally {
      await this.release(lock, descriptor);
    }
  }

  /** Hold an OS lock, which the kernel releases even if a phase crashes. */
  private async acquire(lock: string): Promise<number> {
    while (FileBriefStore.heldLocks.has(lock)) await new Promise((resolve) => setTimeout(resolve, 1));
    FileBriefStore.heldLocks.add(lock);
    let descriptor: number | undefined;
    try {
      // Inside the guard: an open that fails (the directory went away, the
      // process ran out of descriptors) must not leave the in-process claim
      // behind, or every later write to this brief waits forever. `a+`, not
      // `a`: Windows' LockFileEx refuses a handle with append access alone.
      descriptor = fs.openSync(lock, "a+");
      await this.flock(descriptor, "ex");
      return descriptor;
    } catch (error: unknown) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      FileBriefStore.heldLocks.delete(lock);
      throw error;
    }
  }

  /** Release this process and the kernel lock; keep the stable lock inode. */
  private async release(lock: string, descriptor: number): Promise<void> {
    FileBriefStore.heldLocks.delete(lock);
    try {
      await this.flock(descriptor, "un");
    } finally {
      fs.closeSync(descriptor);
    }
  }

  /** fs-ext's callback API keeps a contested flock off the Node event loop. */
  private flock(descriptor: number, operation: "ex" | "un"): Promise<void> {
    return new Promise((resolve, reject) => {
      flock(descriptor, operation, (error) => error ? reject(error) : resolve());
    });
  }

  private ids(): BriefId[] {
    return fs.readdirSync(this.root).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length));
  }

  private file(id: BriefId): string {
    if (id.includes("/") || id.includes(path.sep)) throw new Error(`a brief id cannot contain a path separator: \`${id}\``);
    return path.join(this.root, `${id}.json`);
  }
}
