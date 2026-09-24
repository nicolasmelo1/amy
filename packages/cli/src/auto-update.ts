import fs from "node:fs";
import path from "node:path";
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
  return fs.existsSync(daemonUpdatePath(home, profile));
}

/** Takes a due after-timed daemon update exactly once. */
export function takeDaemonUpdate(home: string, profile: string): boolean {
  const file = daemonUpdatePath(home, profile);
  const claim = `${file}.claimed-${process.pid}`;
  try {
    fs.renameSync(file, claim);
  } catch {
    return false;
  }
  fs.rmSync(claim, { force: true });
  return true;
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
