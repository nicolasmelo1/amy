import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
    await this.mutate(id, async () => {
      const file = this.file(id);
      if (fs.existsSync(file)) fs.rmSync(file);
      return null;
    });
  }

  /** Written to a sibling and renamed, so a brief is never half-written. */
  private save(record: BriefRecord): void {
    const file = this.file(record.id);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
    fs.renameSync(temporary, file);
  }

  /** Serializes a read-modify-write across phase processes for one brief. */
  private async mutate<T>(id: BriefId, change: (existing: BriefRecord | null) => Promise<T>): Promise<T> {
    const lock = `${this.file(id)}.lock`;
    await this.acquire(lock);
    try {
      return await change(await this.get(id));
    } finally {
      this.release(lock);
    }
  }

  /** Atomically publish a complete owner before another process can inspect it. */
  private async acquire(lock: string): Promise<void> {
    for (;;) {
      const gate = `${lock}.acquiring`;
      const privateGate = `${gate}.${process.pid}.${randomUUID()}`;
      fs.writeFileSync(privateGate, `${process.pid}\n`, "utf-8");
      try {
        fs.linkSync(privateGate, gate);
      } catch (error: unknown) {
        fs.rmSync(privateGate, { force: true });
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await new Promise((resolve) => setTimeout(resolve, 1));
        continue;
      }
      fs.rmSync(privateGate, { force: true });
      try {
        if (fs.existsSync(lock)) this.recover(lock);
        if (fs.existsSync(lock)) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          continue;
        }
        const privateOwner = `${lock}.${process.pid}.${randomUUID()}`;
        fs.writeFileSync(privateOwner, `${process.pid}\n`, "utf-8");
        try {
          fs.linkSync(privateOwner, lock);
          return;
        } finally {
          fs.rmSync(privateOwner, { force: true });
        }
      } finally {
        fs.rmSync(gate, { force: true });
      }
    }
  }

  /** A dead owner cannot permanently block a brief after a phase crashes. */
  private recover(lock: string): void {
    const recovery = `${lock}.recovering.${process.pid}.${randomUUID()}`;
    try {
      const owner = Number.parseInt(fs.readFileSync(lock, "utf-8").trim(), 10);
      if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("invalid owner");
      process.kill(owner, 0);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      try {
        // acquire() holds the per-brief gate while recovery and publication run,
        // so this move cannot displace a lock a new writer just published.
        fs.renameSync(lock, recovery);
        this.removeOwnerLinks(lock, recovery);
      } catch (renameError: unknown) {
        if ((renameError as NodeJS.ErrnoException).code !== "ENOENT") throw renameError;
      } finally {
        fs.rmSync(recovery, { force: true });
      }
    }
  }

  /** Remove private hard links left by a process that died while publishing. */
  private removeOwnerLinks(lock: string, recovered: string): void {
    const inode = fs.statSync(recovered).ino;
    for (const name of fs.readdirSync(this.root)) {
      const candidate = path.join(this.root, name);
      if (!candidate.startsWith(`${lock}.`) || candidate === recovered) continue;
      try {
        if (fs.statSync(candidate).ino === inode) fs.rmSync(candidate, { force: true });
      } catch {
        // A concurrent cleaner settled this private owner first.
      }
    }
  }

  /** Release the lock name this mutation acquired. */
  private release(lock: string): void {
    try {
      // A live claim cannot be replaced: stale recovery moves only a dead
      // owner. The unlink therefore removes this acquisition, not a contender.
      fs.unlinkSync(lock);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private ids(): BriefId[] {
    return fs.readdirSync(this.root).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length));
  }

  private file(id: BriefId): string {
    if (id.includes("/") || id.includes(path.sep)) throw new Error(`a brief id cannot contain a path separator: \`${id}\``);
    return path.join(this.root, `${id}.json`);
  }
}
