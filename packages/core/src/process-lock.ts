import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * One way to hold a file lock on this machine.
 *
 * A lock is a file naming its owner, published whole: the owner is written
 * to a staged file and linked into place, so no reader ever finds a lock
 * that is empty or names nobody. A lock is abandoned when its owner's
 * process is gone, when a lease it was taken with ran out unrenewed, or —
 * for a lock naming no process — once it has stood past a grace. An
 * abandoned lock is taken over by linking it to a tombstone named for what
 * was seen: only one process can create that name, so of everyone who saw
 * the same dead owner exactly one removes its lock, and nobody removes the
 * lock a new owner took meanwhile. A lock an earlier amy left — a pid line,
 * a `pid:token` line, a bare token, or a directory holding `owner.json` — is
 * read and recovered the same way, since an old and a new amy run side by
 * side right after an update. See plans/a-lock-is-taken-one-way.md.
 */

export interface LockOptions {
  /** The process the lock is held for; this one unless a caller acts for another. */
  readonly pid?: number;
  /** When set, the lock is abandoned once unrenewed this long, whether its owner lives or not. */
  readonly leaseMs?: number;
  /** How long a lock naming no process stands before it counts as abandoned, when no lease says. */
  readonly graceMs?: number;
  /** The clock a lease is judged by. */
  readonly now?: () => number;
}

export interface HeldLock {
  /** What this holding is told apart by; no other holding ever shares it. */
  readonly stamp: string;
  /** Whether the lock is still this holding's. */
  holds(): boolean;
  /** Renews a lease, answering false once the lock is no longer this holding's. */
  renew(): boolean;
  /** Lets the lock go, only while it is still this holding's. */
  release(): void;
}

/** How long a lock naming no process, or a half-written one, belongs to its maker. */
const GRACE_MS = 10_000;
/** How long a tombstone is kept: past any recoverer still between reading a dead owner and burying it. */
const TOMBSTONE_MS = 60 * 60 * 1000;

/**
 * Whether a process id belongs to something still running. Signal 0 asks
 * without touching it; a process another user owns answers EPERM, and so
 * exists. Zero, a negative or a fractional id is nobody: kill(0, 0) asks
 * about the process group.
 */
export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Takes the lock at `file` for this process, or answers undefined while
 * someone else holds it. One attempt: a caller that waits retries.
 */
export function takeLock(file: string, options: LockOptions = {}): HeldLock | undefined {
  const pid = options.pid ?? process.pid;
  const stamp = `${pid}:${randomUUID()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (publish(file, `${JSON.stringify({ pid, stamp })}\n`, new Date((options.now ?? Date.now)()))) return held(file, stamp, options);
    const seen = look(file);
    // Released between the refused publish and this read: try again.
    if (seen === undefined) continue;
    if (!abandoned(seen, options)) return undefined;
    if (!bury(file, seen)) return undefined;
  }
  return undefined;
}

function held(file: string, stamp: string, options: LockOptions): HeldLock {
  const now = options.now ?? Date.now;
  const holds = () => look(file)?.owner?.stamp === stamp;
  return {
    stamp,
    holds,
    renew: () => {
      if (!holds()) return false;
      const at = new Date(now());
      fs.utimesSync(file, at, at);
      return true;
    },
    release: () => {
      if (holds()) fs.rmSync(file, { force: true });
    },
  };
}

/** Creates `file` holding `content`, taken at `at`, in one step, or answers false when it exists. */
function publish(file: string, content: string, at: Date): boolean {
  const staged = `${file}.${randomUUID()}.staged`;
  try {
    fs.writeFileSync(staged, content, { flag: "wx", mode: 0o600 });
    // Its age is read against the same clock a lease is judged by.
    fs.utimesSync(staged, at, at);
    fs.linkSync(staged, file);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EISDIR" || code === "EPERM") return false;
    throw error;
  } finally {
    fs.rmSync(staged, { force: true });
  }
}

interface Owner {
  readonly pid?: number;
  readonly stamp: string;
}

/** A lock as read once: who it names, if anyone, and which file it was. */
interface Seen {
  readonly owner: Owner | undefined;
  readonly directory: boolean;
  readonly ino: number;
  readonly mtimeMs: number;
}

function look(file: string): Seen | undefined {
  try {
    const stat = fs.statSync(file);
    const directory = stat.isDirectory();
    const ownerFile = directory ? path.join(file, "owner.json") : file;
    let text = "";
    let mtimeMs = stat.mtimeMs;
    try {
      text = fs.readFileSync(ownerFile, "utf-8");
      if (directory) mtimeMs = fs.statSync(ownerFile).mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !directory) throw error;
    }
    return { owner: ownerIn(text), directory, ino: stat.ino, mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The owner a lock's text names, in this version's form or an earlier one's. */
function ownerIn(text: string): Owner | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  try {
    const parsed = JSON.parse(trimmed) as { pid?: unknown; stamp?: unknown };
    if (parsed !== null && typeof parsed === "object" && typeof parsed.stamp === "string") {
      return typeof parsed.pid === "number" ? { pid: parsed.pid, stamp: parsed.stamp } : { stamp: parsed.stamp };
    }
  } catch {
    // An earlier version's line, read below.
  }
  const pid = /^(\d+)(?::|$)/.exec(trimmed)?.[1];
  return pid === undefined ? { stamp: trimmed } : { pid: Number(pid), stamp: trimmed };
}

function abandoned(seen: Seen, options: LockOptions): boolean {
  const age = (options.now ?? Date.now)() - seen.mtimeMs;
  if (options.leaseMs !== undefined && age >= options.leaseMs) return true;
  if (seen.owner?.pid !== undefined) return !processAlive(seen.owner.pid);
  return age >= (options.leaseMs ?? options.graceMs ?? GRACE_MS);
}

/**
 * Removes the abandoned lock that was seen, through its tombstone. Answers
 * false when another process is burying it or already has.
 */
function bury(file: string, seen: Seen): boolean {
  sweep(file);
  const identity = seen.owner?.stamp ?? `${seen.ino}:${seen.mtimeMs}`;
  const tombstone = `${file}.dead-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
  const entombed = entomb(file, tombstone, seen);
  if (entombed !== "entombed") return entombed === "finished" && finishBurial(file, tombstone, seen);
  // The tombstone is ours; the lock it holds must be the one judged abandoned.
  if (!sameLock(look(tombstone), seen)) {
    if (seen.directory) restore(tombstone, file);
    else fs.rmSync(tombstone, { force: true });
    return false;
  }
  if (!seen.directory && look(file)?.ino === seen.ino) fs.rmSync(file, { force: true });
  return true;
}

/**
 * Creates the tombstone from the lock: a link for a file, a rename for a
 * directory, either refused when the tombstone exists. `finished` is a file
 * lock another process already linked, whose burial may need finishing.
 */
function entomb(file: string, tombstone: string, seen: Seen): "entombed" | "finished" | "refused" {
  try {
    if (seen.directory) fs.renameSync(file, tombstone);
    else fs.linkSync(file, tombstone);
    return "entombed";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" && !seen.directory) return "finished";
    if (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM" || code === "ENOENT") return "refused";
    throw error;
  }
}

/** Whether a lock read again is the one seen: the same file, owner and, for a lease, the same last renewal. */
function sameLock(again: Seen | undefined, seen: Seen): boolean {
  return again !== undefined && again.ino === seen.ino && again.owner?.stamp === seen.owner?.stamp && again.mtimeMs === seen.mtimeMs;
}

/**
 * Another process linked this very lock to its tombstone. Within the grace
 * it is still removing it; past the grace it died doing so, and the burial
 * is finished here, removing the lock only while it is still the one judged.
 */
function finishBurial(file: string, tombstone: string, seen: Seen): boolean {
  let buried: fs.Stats;
  try {
    buried = fs.statSync(tombstone);
  } catch {
    return false;
  }
  if (buried.ino !== seen.ino || Date.now() - buried.ctimeMs < GRACE_MS) return false;
  if (look(file)?.ino === seen.ino) fs.rmSync(file, { force: true });
  return true;
}

/** Puts back a directory lock moved by mistake, unless a new one stands in its place. */
function restore(tombstone: string, file: string): void {
  try {
    fs.renameSync(tombstone, file);
  } catch {
    // A new lock stands there now; the moved one is swept with the tombstones.
  }
}

/** Forgets this lock's tombstones once nobody can still be on the way to them. */
function sweep(file: string): void {
  const directory = path.dirname(file);
  const prefix = `${path.basename(file)}.dead-`;
  let names: string[];
  try {
    names = fs.readdirSync(directory).filter((name) => name.startsWith(prefix));
  } catch {
    return;
  }
  for (const name of names) {
    const tombstone = path.join(directory, name);
    try {
      // Linking changes a file's ctime, so a tombstone's age runs from its burial.
      if (Date.now() - fs.statSync(tombstone).ctimeMs > TOMBSTONE_MS) fs.rmSync(tombstone, { recursive: true, force: true });
    } catch {
      // Swept by another process meanwhile.
    }
  }
}
