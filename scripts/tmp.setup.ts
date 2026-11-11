import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** What `os.tmpdir()` reads: TMPDIR on POSIX, TEMP and then TMP on Windows. */
const VARIABLES = ["TMPDIR", "TEMP", "TMP"] as const;

/**
 * One temporary directory per test run, removed when the run ends.
 *
 * Hundreds of tests make a directory with `mkdtempSync(os.tmpdir())` and
 * leave it: a few days of hooks left some 200,000, enough for Spotlight to
 * slow the machine until the git tests timed out. `os.tmpdir()` reads
 * `VARIABLES`, which the workers and every process a test spawns
 * inherit, so pointing them here puts all of it under one directory.
 */
export default function setup(): () => void {
  const previous = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  const run = fs.mkdtempSync(path.join(os.tmpdir(), "amy-tests-"));
  for (const name of VARIABLES) process.env[name] = run;
  return () => {
    for (const name of VARIABLES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    fs.rmSync(run, { recursive: true, force: true });
  };
}
