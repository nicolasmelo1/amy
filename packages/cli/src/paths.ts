import path from "node:path";
import { directoriesFor } from "./profiles.js";

const AMY_DIR = ".amy";

/**
 * What every profile shares, under one `.amy`.
 *
 * The config, the roster, the log, the handbrake, the notes and the inbox are
 * shared on purpose. One log means one budget, and one handbrake means
 * `amy stop` stops the machine rather than the workflow you happened to name.
 */
export function paths(root: string) {
  const base = path.join(root, AMY_DIR);

  return {
    base,
    config: path.join(base, "config.yaml"),
    roster: path.join(base, "roster.yaml"),
    notes: path.join(base, "notes"),
    needsInput: path.join(base, "needs-input"),
    log: path.join(base, "log"),
    stop: path.join(base, "STOP"),
  };
}

/** The two directories that belong to one profile and to nothing else. */
export function profilePaths(root: string, profile: string) {
  const base = path.join(root, AMY_DIR);
  const dirs = directoriesFor(profile);

  return {
    ...paths(root),
    records: path.join(base, dirs.records),
    queue: path.join(base, dirs.queue),
  };
}
