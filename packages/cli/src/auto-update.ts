import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AmyConfig } from "./config.js";

/** The per-profile count belongs beside the profile's other durable state. */
export function autoUpdatePath(home: string, profile: string): string {
  return path.join(home, "workflows", profile, "auto-update.json");
}

/** A due daemon update is held until the child has fully exited. */
function daemonUpdatePath(home: string, profile: string): string {
  return path.join(home, "workflows", profile, "auto-update-daemon");
}

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
  fs.writeFileSync(file, "due\n", "utf8");
}

/** Whether an exited daemon still has a reaper-owned update to run. */
export function hasDaemonUpdate(home: string, profile: string): boolean {
  const file = daemonUpdatePath(home, profile);
  return fs.existsSync(file) || fs.existsSync(`${file}.claiming`) || fs.existsSync(`${file}.claimed`);
}

/** Takes a due after-timed daemon update exactly once, retaining its claim while it runs. */
export function takeDaemonUpdate(home: string, profile: string): boolean {
  const file = daemonUpdatePath(home, profile);
  recoverDaemonUpdateClaim(file);
  const staging = `${file}.claiming`;
  const prepared = `${staging}.${process.pid}.${randomUUID()}`;
  try {
    // Link a fully-written owner into place: another starter can never recover
    // an empty staging file between its creation and its first write.
    fs.writeFileSync(prepared, `${process.pid}\n`, "utf8");
    fs.linkSync(prepared, staging);
    fs.rmSync(prepared, { force: true });
    // A claimant may arrive after the owner moved staging to claimed but before
    // it consumed due. It must leave that owner and its due marker untouched.
    if (!fs.existsSync(file) || fs.existsSync(`${file}.claimed`)) {
      fs.rmSync(staging, { force: true });
      return false;
    }
    fs.renameSync(staging, `${file}.claimed`);
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(prepared, { force: true });
  }
}

/** Returns an abandoned claim to due state without stealing a live updater. */
function recoverDaemonUpdateClaim(file: string): void {
  const claims = [`${file}.claimed`, `${file}.claiming`];
  const claim = claims.find((candidate) => fs.existsSync(candidate));
  if (!claim) return;
  try {
    const owner = Number.parseInt(fs.readFileSync(claim, "utf8").trim(), 10);
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("invalid owner");
    process.kill(owner, 0);
    return;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    try {
      if (claim.endsWith(".claimed")) fs.renameSync(claim, file);
      else fs.rmSync(claim, { force: true });
    } catch {
      // A live owner or another recovery settled the claim first.
    }
  }
}

/** Releases the durable reaper claim only after the scheduled update settled. */
export function finishDaemonUpdate(home: string, profile: string): void {
  fs.rmSync(`${daemonUpdatePath(home, profile)}.claimed`, { force: true });
}

/** Makes a claimed update due again when a shared daemon boundary blocked it. */
export function retryDaemonUpdate(home: string, profile: string): void {
  const file = daemonUpdatePath(home, profile);
  try {
    fs.renameSync(`${file}.claimed`, file);
  } catch {
    // Another recovery owner already settled it; either result is safe.
  }
}

/** Settles an interrupted after-daemon update before a new daemon starts. */
export async function settleDaemonUpdate(home: string, profile: string, update: () => Promise<number>): Promise<boolean> {
  if (!hasDaemonUpdate(home, profile)) return true;
  if (!takeDaemonUpdate(home, profile)) return false;
  if (await update() === 0) {
    finishDaemonUpdate(home, profile);
    return true;
  }
  retryDaemonUpdate(home, profile);
  return false;
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
