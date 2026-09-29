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

/** A lock file nobody owns any more, when it has no pid for this long. */
const UNWRITTEN_LOCK_MS = 5_000;

/**
 * `workId → thread` on disk, shared by every process that mounts the plugin.
 *
 * The state directory is machine-wide, so two workflows' daemons read and
 * write the same map. Reading is free; opening a thread happens under a lock
 * file holding the owner's pid, so no two processes post a root for one work
 * item and no write loses another's entry.
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
    await this.acquire();
    try {
      return await work();
    } finally {
      fs.rmSync(this.lockFile, { force: true });
    }
  }

  private async acquire(): Promise<void> {
    fs.mkdirSync(this.directory, { recursive: true });
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      try {
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: "wx" });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (this.isStale()) {
        fs.rmSync(this.lockFile, { force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`${this.lockFile} is still held; another amy is opening a thread`);
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }

  /** Held by a process that is gone, or created and never written. */
  private isStale(): boolean {
    let text: string;
    let age: number;
    try {
      text = fs.readFileSync(this.lockFile, "utf8");
      age = Date.now() - fs.statSync(this.lockFile).mtimeMs;
    } catch {
      return false;
    }
    const pid = Number(text);
    if (!Number.isInteger(pid) || pid <= 0) return age > UNWRITTEN_LOCK_MS;
    return !isAlive(pid);
  }

  private read(): Record<string, ThreadEntry> {
    if (!fs.existsSync(this.file)) return {};
    return JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, ThreadEntry>;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists and belongs to somebody else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
