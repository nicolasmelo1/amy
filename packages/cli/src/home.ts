import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The directory everything amy knows lives in. */
const AMY_DIR = ".amy";

/**
 * Where this machine's amy keeps its state.
 *
 * One amy per machine, not one per directory. It drives work in repositories
 * all over the disk and it is reached from whichever harness you happen to be
 * in, so its memory cannot depend on where you were standing when you typed
 * the command — an `amy status` run from the wrong directory that answered
 * "nothing tracked yet" would be a lie with a plausible explanation.
 *
 * `AMY_HOME` overrides, which is what a test, a second machine-wide install
 * or a scratch run uses.
 */
export function amyHome(env: NodeJS.ProcessEnv = process.env): string {
  const named = env.AMY_HOME?.trim();
  if (named) return path.resolve(named);

  return path.join(os.homedir(), AMY_DIR);
}

/**
 * The state a directory kept before amy became machine-wide.
 *
 * Reported rather than adopted. Picking it up silently would mean the same
 * command answering differently depending on the directory, which is the
 * behaviour this moved away from.
 */
export function strayState(cwd: string, home: string): string | undefined {
  const here = path.join(cwd, AMY_DIR);
  if (!fs.existsSync(here)) return undefined;

  // Resolved, not compared as strings. On macOS `/var` is a symlink to
  // `/private/var`, so standing in your own state directory looked like
  // standing beside a stray one — and the answer was to move a directory
  // onto itself.
  return real(here) === real(home) ? undefined : here;
}

function real(directory: string): string {
  try {
    return fs.realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}
