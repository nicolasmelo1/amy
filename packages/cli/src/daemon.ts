import fs from "node:fs";
import path from "node:path";

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

/**
 * Whether a process id belongs to something still running.
 *
 * Signal 0 checks for the process without touching it. A process somebody
 * else owns answers `EPERM`, which is still an answer: it exists.
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

/** The loop that is running, or nothing — a record naming a dead pid is nothing. */
export function running(file: string): DaemonRecord | undefined {
  const record = readDaemon(file);
  if (!record) return undefined;
  if (isAlive(record.pid)) return record;

  // Cleared here rather than reported, because a stale file is not news: it
  // is what a reboot leaves behind, and the next `amy start` should just work.
  clearDaemon(file);
  return undefined;
}
