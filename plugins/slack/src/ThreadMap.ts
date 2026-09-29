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

  /**
   * The thread this work already has in `channel`, if it has one.
   *
   * Asking counts as using it, which is what keeps a thread still being read
   * out of the next prune.
   */
  known(workId: string, channel: string): string | undefined {
    const current = this.current(workId);
    const ts = current?.entry.channel === channel ? current.entry.ts : undefined;
    if (ts) touch(this.file(workId, current!.n));
    return ts;
  }

  /**
   * Forgets one work item's thread, returning the root it had, if any.
   *
   * The thread stays in Slack; only this machine's memory of it goes, so the
   * next `open` for the same work starts a new one.
   */
  forget(workId: string): string | undefined {
    const ts = this.current(workId)?.entry.ts;
    fs.rmSync(this.directoryOf(workId), { recursive: true, force: true });
    return ts;
  }

  /**
   * Forgets every settled thread nobody used since `cutoffMs`, returning the
   * roots it forgot. An attempt still posting is never pruned while its owner
   * is alive, however old.
   */
  prune(cutoffMs: number): string[] {
    if (!fs.existsSync(this.root)) return [];
    const forgotten: string[] = [];
    for (const name of fs.readdirSync(this.root)) {
      const workId = Buffer.from(name, "base64url").toString();
      const current = this.current(workId);
      if (!current) continue;
      if (current.entry.owner && isAlive(pidOf(current.entry.owner))) continue;
      if (fs.statSync(this.file(workId, current.n)).mtimeMs >= cutoffMs) continue;
      this.forget(workId);
      if (current.entry.ts) forgotten.push(current.entry.ts);
    }
    return forgotten;
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
      // Once, before the post: a failure reported later must not move it.
      const pendingSince = recoverSince ?? Date.now();
      const owner = `${process.pid}:${randomUUID()}`;
      if (!this.create(workId, next, { channel, pendingSince, owner })) continue;

      let ts: string;
      try {
        ts = await start(recoverSince);
      } catch (error) {
        // Released, not removed: Slack may have taken the root before the
        // call failed, and the next attempt recovers from this instant.
        this.replace(workId, next, { channel, pendingSince });
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
    } catch (error) {
      // Removed by the owner that superseded it between the listing and the
      // read; anything else is a real problem and is not retried into a loop.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.current(workId);
      throw error;
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

function touch(file: string): void {
  const now = new Date();
  try {
    fs.utimesSync(file, now, now);
  } catch {
    // Superseded or forgotten between the read and the touch: nothing to keep.
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
