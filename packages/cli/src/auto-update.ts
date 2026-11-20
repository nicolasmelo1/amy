import fs from "node:fs";
import path from "node:path";
import { createExclusively, processAlive, takeLock } from "@amykit/core";
import type { HeldLock } from "@amykit/core";
import { AmyConfig } from "./config.js";

/** The per-profile count belongs beside the profile's other durable state. */
export function autoUpdatePath(home: string, profile: string): string {
  return path.join(home, "workflows", profile, "auto-update.json");
}

/** A due daemon update is held until the child has fully exited. */
function daemonUpdatePath(home: string, profile: string): string {
  return path.join(home, "workflows", profile, "auto-update-daemon");
}

/** The claims this process is holding, by the file each one published. */
const claims = new Map<string, HeldLock>();

function readRuns(home: string, profile: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(autoUpdatePath(home, profile), "utf8")) as { runs?: unknown };
    return typeof parsed.runs === "number" && Number.isSafeInteger(parsed.runs) && parsed.runs >= 0
      ? parsed.runs
      : 0;
  } catch {
    return 0;
  }
}

function writeRuns(home: string, profile: string, runs: number): void {
  const file = autoUpdatePath(home, profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ runs }, null, 2)}\n`, "utf8");
}

export interface AutoUpdateInvocation {
  home: string;
  profile: string;
  config: AmyConfig;
  update: () => Promise<number>;
  work: () => Promise<void>;
}

export interface ScheduledAutoUpdate {
  due: boolean;
  timing: "before" | "after";
}

/** Records one invocation and tells its caller whether an update is due. */
export function beginAutoUpdateInvocation(home: string, profile: string, config: AmyConfig): ScheduledAutoUpdate {
  const runs = readRuns(home, profile) + 1;
  writeRuns(home, profile, runs);
  return {
    due: config.autoUpdate.enabled && runs % config.autoUpdate.everyRuns === 0,
    timing: config.autoUpdate.timing,
  };
}

/** Remembers an after-timed daemon update until the parent stops its child. */
export function markDaemonUpdate(home: string, profile: string): void {
  const file = daemonUpdatePath(home, profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeDue(file);
}

/** Whether an exited daemon still has a reaper-owned update to run. */
export function hasDaemonUpdate(home: string, profile: string): boolean {
  const file = daemonUpdatePath(home, profile);
  return fs.existsSync(file) || fs.existsSync(`${file}.claiming`) || fs.existsSync(`${file}.claimed`);
}

/**
 * Takes a due after-timed daemon update exactly once, retaining its claim
 * while it runs.
 *
 * The claim is core's lock, so a starter that read a stale owner cannot act
 * on it: the tombstone decides one recoverer, and a live owner keeps the
 * claim whatever its pid looked like a moment earlier.
 */
export function takeDaemonUpdate(home: string, profile: string): boolean {
  const file = daemonUpdatePath(home, profile);
  if (stagingBlocks(file)) return false;
  const claim = `${file}.claimed`;
  // Who held the claim a moment ago. What the holder's liveness means is
  // decided after the lock is this process's (below), never before it: an
  // owner that finished and released between this read and the take leaves
  // no due for anyone, and re-running it would update twice for one due.
  const seen = claimOwner(claim);
  const lock = takeLock(claim);
  if (!lock) return false;
  // The lock refused nobody: either it was free (its owner finished and
  // released, or there was none) or its owner was gone and was buried. Only
  // a claim taken over from a gone owner consumed a due nobody has run.
  const interrupted = seen.present && (seen.pid === undefined || !processAlive(seen.pid));
  if (!fs.existsSync(file)) {
    if (!interrupted) {
      lock.release();
      return false;
    }
    writeDue(file);
  }
  fs.rmSync(file, { force: true });
  claims.set(claim, lock);
  return true;
}

/** Returns an abandoned claim to due state without stealing a live updater. */
function stagingBlocks(file: string): boolean {
  const staging = `${file}.claiming`;
  if (!fs.existsSync(staging)) return false;
  if (processAlive(legacyOwner(staging))) return true;
  try {
    fs.rmSync(staging, { force: true });
  } catch {
    // Another recovery settled the stale marker first.
  }
  return false;
}

/**
 * The claim as it stood before this process took it: whether there was one,
 * and the pid it named. A claim that names no process is still a claim.
 */
function claimOwner(claim: string): { present: boolean; pid?: number } {
  let text: string;
  try {
    text = fs.readFileSync(claim, "utf8").trim();
  } catch {
    return { present: false };
  }
  let pid: number;
  try {
    pid = text.startsWith("{") ? Number((JSON.parse(text) as { pid?: unknown }).pid) : Number.parseInt(text, 10);
  } catch {
    return { present: true };
  }
  return Number.isSafeInteger(pid) && pid > 0 ? { present: true, pid } : { present: true };
}

/** A marker an older amy wrote names its pid on the first line; a lock names it in JSON. */
function legacyOwner(marker: string): number {
  try {
    const text = fs.readFileSync(marker, "utf8").trim();
    if (text.startsWith("{")) return Number((JSON.parse(text) as { pid?: unknown }).pid);
    return Number.parseInt(text, 10);
  } catch {
    return Number.NaN;
  }
}

/** Releases the durable reaper claim only after the scheduled update settled. */
function finishDaemonUpdate(home: string, profile: string): void {
  releaseClaim(`${daemonUpdatePath(home, profile)}.claimed`);
}

/** Makes a claimed update due again when a shared daemon boundary blocked it. */
function retryDaemonUpdate(home: string, profile: string): void {
  const file = daemonUpdatePath(home, profile);
  // Written while the claim is still held: no other starter can take the same
  // due between this marker and the release.
  writeDue(file);
  releaseClaim(`${file}.claimed`);
}

/** Lets go of a claim this process holds, and only that one. */
function releaseClaim(claim: string): void {
  const lock = claims.get(claim);
  claims.delete(claim);
  lock?.release();
}

/** The one sequence a claimed update runs: update, then finish or retry. */
export async function settleClaimedDaemonUpdate(
  home: string,
  profile: string,
  update: () => Promise<number>,
): Promise<boolean> {
  let code: number;
  try {
    code = await update();
  } catch {
    // An update that threw did not finish either: the claim must not stay
    // held by a process whose child is gone, and the due must not be lost.
    code = 1;
  }
  if (code === 0) {
    finishDaemonUpdate(home, profile);
    return true;
  }
  retryDaemonUpdate(home, profile);
  return false;
}

/** Settles an interrupted after-daemon update before a new daemon starts. */
export async function settleDaemonUpdate(home: string, profile: string, update: () => Promise<number>): Promise<boolean> {
  if (!hasDaemonUpdate(home, profile)) return true;
  // A stale staging claim can be the last marker. Recovery removes it, so a
  // failed take is settled when no due or claim marker remains to be claimed.
  if (!takeDaemonUpdate(home, profile)) return !hasDaemonUpdate(home, profile);
  return settleClaimedDaemonUpdate(home, profile, update);
}

/** A due marker is created, never overwritten, so a second writer adds nothing. */
function writeDue(file: string): void {
  createExclusively(file, "due\n");
}

/**
 * Counts one lifecycle invocation, then places a due update at its requested
 * boundary. The count is written before the update so a failed attempt remains
 * an invocation after a restart rather than becoming due forever.
 */
export async function runWithAutoUpdate({ home, profile, config, update, work }: AutoUpdateInvocation): Promise<void> {
  const schedule = beginAutoUpdateInvocation(home, profile, config);

  if (schedule.due && schedule.timing === "before") await updateOrThrow(update);
  await work();
  if (schedule.due && schedule.timing === "after") await updateOrThrow(update);
}

async function updateOrThrow(update: () => Promise<number>): Promise<void> {
  if (await update() !== 0) throw new Error("amy update failed");
}
