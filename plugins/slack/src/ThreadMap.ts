import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * One attempt at a work item's thread: its root `ts` once Slack answered, or
 * the owner still posting it and the instant the first attempt began, so a
 * crash between Slack taking a root and this file learning it is recoverable.
 */
export interface ThreadEntry {
  channel: string;
  ts?: string;
  /** When the first attempt of this chain was about to post. */
  pendingSince?: number;
  /** `<pid>:<uuid>` of the attempt still posting; absent once released. */
  owner?: string;
}

export interface ThreadMapOptions {
  /** How long to wait for a live owner to finish before failing. */
  maxWaitMs?: number;
  pollMs?: number;
}

/** What `start` is told: when an earlier attempt that may have posted began. */
export type StartRoot = (recoverSince: number | undefined) => Promise<string>;

/**
 * `workId → thread` on disk, shared by every process that mounts the plugin.
 *
 * The state directory is machine-wide, so several daemons use it at once.
 * Each work item is a chain of numbered generations, `threads/<id>/<n>.json`,
 * and a generation is created exclusively — written aside and linked into
 * place — so exactly one process wins each number. Taking over from an owner
 * that died is creating the next number, so no claim is ever removed while
 * somebody may hold it, and one work item's file is never rewritten by the
 * opening of another.
 */
export class ThreadMap {
  private readonly root: string;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;

  constructor(directory: string, options: ThreadMapOptions = {}) {
    this.root = path.join(directory, "threads");
    // An owner may be waiting out Slack's one-a-minute limit several times.
    this.maxWaitMs = options.maxWaitMs ?? 10 * 60_000;
    this.pollMs = options.pollMs ?? 100;
  }

  /** The thread this work already has in `channel`, if it has one. */
  known(workId: string, channel: string): string | undefined {
    const current = this.current(workId)?.entry;
    return current?.channel === channel ? current.ts : undefined;
  }

  /** The work's thread in `channel`, posting its root through `start` only if nobody has. */
  async open(workId: string, channel: string, start: StartRoot): Promise<string> {
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const current = this.current(workId);
      const entry = current?.entry.channel === channel ? current.entry : undefined;
      if (entry?.ts) return entry.ts;

      if (entry?.owner && isAlive(pidOf(entry.owner))) {
        if (Date.now() >= deadline) throw new Error(`another amy is still opening the thread for ${workId}`);
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
        continue;
      }

      const next = (current?.n ?? 0) + 1;
      const recoverSince = entry?.pendingSince;
      const owner = `${process.pid}:${randomUUID()}`;
      if (!this.create(workId, next, { channel, pendingSince: recoverSince ?? Date.now(), owner })) continue;

      let ts: string;
      try {
        ts = await start(recoverSince);
      } catch (error) {
        // Released, not removed: Slack may have taken the root before the
        // call failed, and the next attempt recovers from this instant.
        this.replace(workId, next, { channel, pendingSince: recoverSince ?? Date.now() });
        throw error;
      }
      this.replace(workId, next, { channel, ts });
      this.forgetBefore(workId, next);
      return ts;
    }
  }

  private current(workId: string): { n: number; entry: ThreadEntry } | undefined {
    const n = Math.max(0, ...this.generations(workId));
    if (n === 0) return undefined;
    try {
      return { n, entry: JSON.parse(fs.readFileSync(this.file(workId, n), "utf8")) as ThreadEntry };
    } catch {
      // Removed by the owner that superseded it between the listing and the read.
      return this.current(workId);
    }
  }

  private generations(workId: string): number[] {
    const directory = this.directoryOf(workId);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
  }

  /** Exclusive: false when somebody else already holds this number. */
  private create(workId: string, n: number, entry: ThreadEntry): boolean {
    fs.mkdirSync(this.directoryOf(workId), { recursive: true });
    const staged = this.staged(workId);
    fs.writeFileSync(staged, JSON.stringify(entry));
    try {
      fs.linkSync(staged, this.file(workId, n));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    } finally {
      fs.rmSync(staged, { force: true });
    }
  }

  /** Only by the generation's owner, whole and renamed into place. */
  private replace(workId: string, n: number, entry: ThreadEntry): void {
    const staged = this.staged(workId);
    fs.writeFileSync(staged, JSON.stringify(entry));
    fs.renameSync(staged, this.file(workId, n));
  }

  /** Older generations are settled history once a root is known. */
  private forgetBefore(workId: string, n: number): void {
    for (const older of this.generations(workId)) {
      if (older < n) fs.rmSync(this.file(workId, older), { force: true });
    }
  }

  private directoryOf(workId: string): string {
    return path.join(this.root, Buffer.from(workId).toString("base64url"));
  }

  private file(workId: string, n: number): string {
    return path.join(this.directoryOf(workId), `${n}.json`);
  }

  private staged(workId: string): string {
    return path.join(this.directoryOf(workId), `.${randomUUID()}.tmp`);
  }
}

function pidOf(owner: string): number {
  return Number(owner.split(":")[0]);
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists and belongs to somebody else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
