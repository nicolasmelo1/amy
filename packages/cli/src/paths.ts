import path from "node:path";
import { directoriesFor } from "./profiles.js";

/**
 * What every profile shares, under one state directory.
 *
 * The config, the roster, the log, the handbrake, the notes and the inbox are
 * shared on purpose. One log means one budget, and one handbrake means
 * `amy pause` stops the machine rather than the workflow you happened to name.
 */
export function paths(home: string) {
  return {
    base: home,
    config: path.join(home, "config.yaml"),
    roster: path.join(home, "roster.yaml"),
    notes: path.join(home, "notes"),
    needsInput: path.join(home, "needs-input"),
    log: path.join(home, "log"),
    stop: path.join(home, "PAUSED"),
    /** Written by the daemon, so a second one refuses rather than doubles up. */
    pid: path.join(home, "daemon.pid"),
  };
}

/** The two directories that belong to one profile and to nothing else. */
export function profilePaths(home: string, profile: string) {
  const dirs = directoriesFor(profile);

  return {
    ...paths(home),
    records: path.join(home, dirs.records),
    queue: path.join(home, dirs.queue),
  };
}
