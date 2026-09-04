import path from "node:path";
import { Profile, directoriesFor } from "./profiles.js";

const AMY_DIR = ".amy";

/**
 * Where everything lives, for one profile.
 *
 * The records and the queue are the only two that move: everything else —
 * the config, the log, the handbrake, the notes, the inbox — is shared, on
 * purpose. One log means one budget, and one handbrake means `amy stop`
 * stops both workflows rather than the one you happened to name.
 */
export function paths(root: string, profile: Profile = "ticket-to-qa") {
  const base = path.join(root, AMY_DIR);
  const dirs = directoriesFor(profile);

  return {
    base,
    config: path.join(base, "config.yaml"),
    roster: path.join(base, "roster.yaml"),
    records: path.join(base, dirs.records),
    tickets: path.join(base, "tickets"),
    queue: path.join(base, dirs.queue),
    notes: path.join(base, "notes"),
    needsInput: path.join(base, "needs-input"),
    log: path.join(base, "log"),
    stop: path.join(base, "STOP"),
  };
}
