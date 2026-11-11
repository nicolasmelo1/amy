import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * One temporary directory per test run, removed when the run ends.
 *
 * Hundreds of tests make a directory with `mkdtempSync(os.tmpdir())` and leave
 * it: a run left some 1,700 behind, and a few days of hooks some 200,000,
 * enough for Spotlight to index the machine to a crawl and time out the git
 * tests. `os.tmpdir()` reads TMPDIR, which the workers and every process a
 * test spawns inherit, so pointing it here puts all of them under one
 * directory this teardown removes. A test that cleans up after itself still
 * may; one that does not no longer leaks.
 */
export default function setup(): () => void {
  const previous = process.env.TMPDIR;
  const run = fs.mkdtempSync(path.join(os.tmpdir(), "amy-tests-"));
  process.env.TMPDIR = run;
  return () => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    fs.rmSync(run, { recursive: true, force: true });
  };
}
