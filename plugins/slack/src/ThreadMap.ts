import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * One generation of a work item's thread: its root `ts` once Slack answered,
 * the owner still posting it, or a tombstone left by whoever is forgetting it.
 */
export interface ThreadEntry {
  channel?: string;
  ts?: string;
  /** When the first attempt of this chain was about to post. */
  pendingSince?: number;
  /** `<pid>:<uuid>` of the attempt still posting or forgetting; absent once released. */
  owner?: string;
  /** This work is being forgotten; nothing before it counts any more. */
  tombstone?: true;
}

export interface ThreadMapOptions {
  /** How long to wait for a live owner to finish before failing. */
  maxWaitMs?: number;
  pollMs?: number;
  /** How long an owner's claim holds without being renewed. */
  leaseMs?: number;
}

/** What `start` is told: when an earlier attempt that may have posted began. */
export type StartRoot = (recoverSince: number | undefined) => Promise<string>;

interface Generation {
  n: number;
  entry: ThreadEntry;
  mtimeMs: number;
}

/**
 * `workId → thread` on disk, shared by every process that mounts the plugin.
 *
 * The state directory is machine-wide, so several daemons use it at once.
 * Each work item is a chain of numbered generations, `threads/<id>/<n>.json`,
 * and a generation is created exclusively — written aside and linked into
 * place — so exactly one process wins each number. Everything that changes
 * what a chain means claims the next number first: posting a root, taking
 * over from an owner that died, and forgetting the work, which leaves a
 * tombstone and re-checks under it before removing anything.
 *
 * An owner holds its claim by lease: its generation's mtime is renewed while
 * it works, and a claim whose lease ran out is dead even if some other
 * process now has its pid.
 */
export class ThreadMap {
  private readonly root: string;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;
  private readonly leaseMs: number;
  /** Which work a root belongs to, as far as this process has seen. */
  private readonly workOf = new Map<string, string>();

  constructor(directory: string, options: ThreadMapOptions = {}) {
    this.root = path.join(directory, "threads");
    // An owner may be waiting out Slack's one-a-minute limit several times.
    this.maxWaitMs = options.maxWaitMs ?? 10 * 60_000;
    this.pollMs = options.pollMs ?? 100;
    this.leaseMs = options.leaseMs ?? 60_000;
  }

  /**
   * The thread this work already has in `channel`, if it has one.
   *
   * Asking counts as using it. The touch comes before looking for a
   * tombstone, so a forget racing this either sees the touch and backs off,
   * or left its tombstone first and this answers that there is no thread.
   */
  known(workId: string, channel: string): string | undefined {
    requireId(workId);
    const current = this.current(workId);
    const ts = inChannel(current, channel)?.ts;
    if (!ts) return undefined;
    touch(this.file(workId, current!.n));
    if (Math.max(0, ...this.generations(workId)) !== current!.n) return undefined;
    this.workOf.set(ts, workId);
    return ts;
  }

  /** Marks the thread with this root as used, so reading its replies keeps it. */
  used(ts: string): void {
    const workId = this.workOf.get(ts) ?? this.findWork(ts);
    if (!workId) return;
    const current = this.current(workId);
    if (current?.entry.ts === ts) touch(this.file(workId, current.n));
  }

  /**
   * Forgets one work item's thread, returning the root it had, if any.
   *
   * The thread stays in Slack; only this machine's memory of it goes, so the
   * next `open` for the same work starts a new one.
   */
  forget(workId: string): string | undefined {
    requireId(workId);
    const outcome = this.retire(workId, (generation) => !this.isLive(generation));
    if (outcome === "busy") {
      // Its root may be reaching Slack right now; forgetting it would leave
      // that root with no memory, and the next open would post a second.
      throw new Error(`the thread for ${workId} is being opened right now; forget it once that finishes`);
    }
    return outcome;
  }

  /**
   * Forgets every settled thread nobody used since `cutoffMs`, returning the
   * roots it forgot. An attempt whose owner still holds its lease is never
   * pruned, however old.
   */
  prune(cutoffMs: number): string[] {
    const stale = (generation: Generation) =>
      !generation.entry.tombstone && !this.isLive(generation) && generation.mtimeMs < cutoffMs;

    const forgotten: string[] = [];
    for (const name of entriesOf(this.root)) {
      if (name.startsWith(".")) continue;
      const outcome = this.retire(Buffer.from(name, "base64url").toString(), stale);
      if (outcome && outcome !== "busy") forgotten.push(outcome);
    }
    return forgotten;
  }

  /** The work's thread in `channel`, posting its root through `start` only if nobody has. */
  async open(workId: string, channel: string, start: StartRoot): Promise<string> {
    requireId(workId);
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const current = this.current(workId);
      if (this.mustWaitOn(current)) {
        if (Date.now() >= deadline) throw new Error(`another amy is still working on the thread for ${workId}`);
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
        continue;
      }
      const entry = inChannel(current, channel);
      if (entry?.ts) {
        this.workOf.set(entry.ts, workId);
        return entry.ts;
      }
      const ts = await this.attempt(workId, channel, (current?.n ?? 0) + 1, entry?.pendingSince, start);
      if (ts !== undefined) return ts;
    }
  }

  /**
   * A live owner still posting a root — for any channel: one for the old
   * channel finishing after a newer generation settled would hand back a
   * thread that is no longer current — or a live tombstone.
   */
  private mustWaitOn(current: Generation | undefined): boolean {
    return current !== undefined && !current.entry.ts && this.isLive(current);
  }

  /**
   * One attempt at generation `next`: undefined when somebody else won the
   * number, the root's `ts` when this one posted or recovered it.
   */
  private async attempt(
    workId: string,
    channel: string,
    next: number,
    recoverSince: number | undefined,
    start: StartRoot,
  ): Promise<string | undefined> {
    // Once, before the post: a failure reported later must not move it.
    const pendingSince = recoverSince ?? Date.now();
    const owner = `${process.pid}:${randomUUID()}`;
    if (!this.create(workId, next, { channel, pendingSince, owner })) return undefined;

    const renew = setInterval(() => touch(this.file(workId, next)), Math.max(1, Math.floor(this.leaseMs / 4)));
    renew.unref();
    let ts: string;
    try {
      ts = await start(recoverSince);
    } catch (error) {
      // Released, not removed: Slack may have taken the root before the
      // call failed, and the next attempt recovers from this instant.
      this.replace(workId, next, { channel, pendingSince });
      throw error;
    } finally {
      clearInterval(renew);
    }
    this.replace(workId, next, { channel, ts });
    this.removeBelow(workId, next);
    this.workOf.set(ts, workId);
    return ts;
  }

  /**
   * Forgets a work item when `shouldGo` holds, asked again under a tombstone.
   *
   * The tombstone is the next generation, created exclusively, so nobody can
   * post or take over while it stands. If what it covers changed before the
   * tombstone landed — touched, or taken — the forget backs off and removes
   * only its own tombstone.
   */
  private retire(workId: string, shouldGo: (generation: Generation) => boolean): string | "busy" | undefined {
    const seen = this.current(workId);
    if (!seen) return undefined;
    if (!shouldGo(seen)) return "busy";
    const tombstone = seen.n + 1;
    if (!this.create(workId, tombstone, { tombstone: true, owner: `${process.pid}:${randomUUID()}` })) return "busy";

    const covered = this.read(workId, seen.n);
    if (!covered || !shouldGo(covered)) {
      fs.rmSync(this.file(workId, tombstone), { force: true });
      return "busy";
    }
    this.removeBelow(workId, tombstone);
    fs.rmSync(this.file(workId, tombstone), { force: true });
    try {
      fs.rmdirSync(this.directoryOf(workId));
    } catch {
      // Somebody started a new chain for this work already; it is theirs.
    }
    if (covered.entry.ts) this.workOf.delete(covered.entry.ts);
    return covered.entry.ts;
  }

  private isLive(generation: Generation): boolean {
    const owner = generation.entry.owner;
    if (!owner) return false;
    return Date.now() - generation.mtimeMs < this.leaseMs && isAlive(pidOf(owner));
  }

  private current(workId: string): Generation | undefined {
    const n = Math.max(0, ...this.generations(workId));
    if (n === 0) return undefined;
    // Removed by the owner that superseded it between the listing and the read.
    return this.read(workId, n) ?? this.current(workId);
  }

  /** One generation, or nothing if it is gone; anything else is a real problem. */
  private read(workId: string, n: number): Generation | undefined {
    const file = this.file(workId, n);
    try {
      const mtimeMs = fs.statSync(file).mtimeMs;
      return { n, entry: JSON.parse(fs.readFileSync(file, "utf8")) as ThreadEntry, mtimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private findWork(ts: string): string | undefined {
    for (const name of entriesOf(this.root)) {
      if (name.startsWith(".")) continue;
      const workId = Buffer.from(name, "base64url").toString();
      if (this.current(workId)?.entry.ts === ts) {
        this.workOf.set(ts, workId);
        return workId;
      }
    }
    return undefined;
  }

  private generations(workId: string): number[] {
    return entriesOf(this.directoryOf(workId))
      .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
  }

  /**
   * Exclusive: false when somebody else already holds this number, or when
   * the chain's directory went away under a forget and has to be made again.
   */
  private create(workId: string, n: number, entry: ThreadEntry): boolean {
    fs.mkdirSync(this.root, { recursive: true });
    // Staged outside the chain, so a forget can always remove an empty one.
    const staged = path.join(this.root, `.${randomUUID()}.tmp`);
    fs.writeFileSync(staged, JSON.stringify(entry));
    try {
      fs.mkdirSync(this.directoryOf(workId), { recursive: true });
      fs.linkSync(staged, this.file(workId, n));
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOENT") throw error;
      return false;
    } finally {
      fs.rmSync(staged, { force: true });
    }
  }

  /** Only by the generation's owner, whole and renamed into place. */
  private replace(workId: string, n: number, entry: ThreadEntry): void {
    const staged = path.join(this.root, `.${randomUUID()}.tmp`);
    fs.writeFileSync(staged, JSON.stringify(entry));
    fs.renameSync(staged, this.file(workId, n));
  }

  /** Generations under `n` are settled history once `n` is decided. */
  private removeBelow(workId: string, n: number): void {
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
}

/** The generation's entry when it is a thread in `channel`, not a tombstone. */
function inChannel(current: Generation | undefined, channel: string): ThreadEntry | undefined {
  return current && !current.entry.tombstone && current.entry.channel === channel ? current.entry : undefined;
}

/** A directory's names, or none if a forget removed it a moment ago. */
function entriesOf(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** An empty id would name the whole `threads` directory. */
function requireId(workId: string): void {
  if (!workId) throw new Error("a work id is required, and an empty one would name every thread");
}

/** Renews a claim or a last use; a file gone meanwhile has nothing to keep. */
function touch(file: string): void {
  const now = new Date();
  try {
    fs.utimesSync(file, now, now);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
