import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * A work item's thread: its root `ts` once Slack answered, or the instant a
 * root was about to be posted, so a crash between the two can be recovered.
 */
export interface ThreadEntry {
  channel: string;
  ts?: string;
  pendingSince?: number;
}

export interface ThreadMapOptions {
  /** How long to wait for another process's lock before failing. */
  maxWaitMs?: number;
  pollMs?: number;
}

/**
 * `workId → thread` on disk, shared by every process that mounts the plugin.
 *
 * The state directory is machine-wide, so two workflows' daemons read and
 * write the same map. Reading is free; opening a thread happens under a lock
 * file holding the owner's pid and a claim for this one acquisition, so no
 * two processes post a root for one work item and no write loses another's
 * entry.
 */
export class ThreadMap {
  private readonly file: string;
  private readonly lockFile: string;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;

  constructor(
    private readonly directory: string,
    options: ThreadMapOptions = {},
  ) {
    this.file = path.join(directory, "threads.json");
    this.lockFile = path.join(directory, "threads.lock");
    // A holder may be waiting out Slack's one-a-minute limit several times.
    this.maxWaitMs = options.maxWaitMs ?? 10 * 60_000;
    this.pollMs = options.pollMs ?? 100;
  }

  get(workId: string): ThreadEntry | undefined {
    return this.read()[workId];
  }

  /** Only under `withLock`. Written whole and renamed into place. */
  set(workId: string, entry: ThreadEntry): void {
    const threads = { ...this.read(), [workId]: entry };
    const partial = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(partial, JSON.stringify(threads, null, 2));
    fs.renameSync(partial, this.file);
  }

  async withLock<T>(work: () => Promise<T>): Promise<T> {
    const claim = await this.acquire();
    try {
      return await work();
    } finally {
      // Only our own: a live holder's lock is never broken, so a lock that
      // still reads our claim is still ours.
      if (this.readLock() === claim) fs.rmSync(this.lockFile, { force: true });
    }
  }

  private async acquire(): Promise<string> {
    fs.mkdirSync(this.directory, { recursive: true });
    const claim = `${process.pid}:${randomUUID()}`;
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      if (this.publish(claim)) return claim;
      const held = this.readLock();
      if (held !== undefined && !isAlive(pidOf(held)) && this.breakStale(held)) continue;
      if (Date.now() >= deadline) throw new Error(`${this.lockFile} is still held; another amy is opening a thread`);
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }

  /**
   * Written aside and linked into place, which fails if a lock exists: the
   * lock file never exists without the claim that owns it.
   */
  private publish(claim: string): boolean {
    const staged = `${this.lockFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(staged, claim);
    try {
      fs.linkSync(staged, this.lockFile);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    } finally {
      fs.rmSync(staged, { force: true });
    }
  }

  /**
   * One breaker per dead claim. Every waiter that saw the same dead holder
   * races for the breaker named after it; the winner removes the lock only
   * if it still carries that claim, and a loser removes nothing — so a lock
   * somebody took after the dead one is never the one removed.
   */
  private breakStale(claim: string): boolean {
    const breaker = `${this.lockFile}.${createHash("sha256").update(claim).digest("hex").slice(0, 16)}.break`;
    try {
      fs.writeFileSync(breaker, String(process.pid), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A breaker whose own process died mid-break would hold this lock
      // forever; clearing it lets the next waiter try.
      if (!isAlive(pidOf(readOrEmpty(breaker)))) fs.rmSync(breaker, { force: true });
      return false;
    }
    try {
      if (this.readLock() === claim) fs.rmSync(this.lockFile, { force: true });
    } finally {
      fs.rmSync(breaker, { force: true });
    }
    return true;
  }

  private readLock(): string | undefined {
    try {
      return fs.readFileSync(this.lockFile, "utf8");
    } catch {
      return undefined;
    }
  }


  private read(): Record<string, ThreadEntry> {
    if (!fs.existsSync(this.file)) return {};
    return JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, ThreadEntry>;
  }
}

function readOrEmpty(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function pidOf(claim: string): number {
  return Number(claim.split(":")[0]);
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
