import fs from "node:fs";
import path from "node:path";
import { processAlive, takeLock } from "@amykit/core";

/**
 * What is written down about the loop that is running.
 *
 * A file rather than a lock: it survives the process that wrote it, which is
 * the case worth handling — a machine that was rebooted mid-run leaves one
 * behind, and a second `amy start` has to be able to tell that from a loop
 * that is genuinely up.
 */
export interface DaemonRecord {
  pid: number;
  /** Which profile it is driving, so `amy status` says so without guessing. */
  workflow: string;
  startedAt: string;
}

export function readDaemon(file: string): DaemonRecord | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as DaemonRecord;
  } catch {
    return undefined;
  }
}

export function writeDaemon(file: string, record: DaemonRecord): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

export function clearDaemon(file: string): void {
  fs.rmSync(file, { force: true });
}

/** Claims a stopped daemon record without removing a newer loop's record. */
export function claimExitedDaemon(file: string, pid: number): DaemonRecord | undefined {
  const claim = `${file}.exited-${process.pid}`;
  try {
    fs.renameSync(file, claim);
  } catch {
    return undefined;
  }

  const record = readDaemon(claim);
  if (!record || record.pid !== pid || processAlive(record.pid)) {
    if (!fs.existsSync(file)) fs.renameSync(claim, file);
    else fs.rmSync(claim, { force: true });
    return undefined;
  }

  fs.rmSync(claim, { force: true });
  return record;
}

/**
 * Claims the short boundary where a loop becomes visible, or an update owns
 * the machine: a start cannot slip between an update's running check and its
 * package move. The core's lock is published whole, so a lock being taken is
 * never read as one its owner abandoned.
 */
export function claimDaemonBoundary(pidFile: string): (() => void) | undefined {
  const lock = takeLock(`${pidFile}.lock`);
  return lock ? () => lock.release() : undefined;
}

/** The loop that is running, or nothing — a record naming a dead pid is nothing. */
export function running(file: string): DaemonRecord | undefined {
  const record = readDaemon(file);
  if (!record) return undefined;
  if (processAlive(record.pid)) return record;

  // Cleared here rather than reported, because a stale file is not news: it
  // is what a reboot leaves behind, and the next `amy start` should just work.
  clearDaemon(file);
  return undefined;
}

/** A live record belongs to the profile that wrote it, not merely its path. */
export function runningForWorkflow(file: string, workflow: string): DaemonRecord | undefined {
  const record = running(file);
  return record?.workflow === workflow ? record : undefined;
}

/** What one loop needs from the process around it, so the order of its moves can be driven in a test. */
export interface Loop {
  readonly idleMs: number;
  stopping(): boolean;
  paused(): boolean;
  /** One pass: discovery, then a tick. Idle when there was nothing to do. */
  turn(): Promise<{ idle: boolean }>;
  /** Whether a fork or a workflow of your own changed since it was mounted. */
  changed(): boolean;
  /** Mounts again from the config alone; only ever called between two turns. */
  remount(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/**
 * The daemon's loop. A change to what is mounted is noticed at the top of a
 * pass and answered there (S17): a tick in progress always finishes on the
 * mount it started with, and the next one starts on the new mount.
 */
export async function runLoop(loop: Loop): Promise<void> {
  while (!loop.stopping()) {
    if (loop.paused()) {
      await loop.sleep(loop.idleMs);
      continue;
    }
    if (loop.changed()) {
      await loop.remount();
      if (loop.stopping()) break;
    }
    const { idle } = await loop.turn();
    if (idle) await loop.sleep(loop.idleMs);
  }
}
