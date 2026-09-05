// Writes the identity of this build beside the code, for `npm pack`.
//
// Usage: node scripts/write-stamp.mjs [outfile]
//
// Run from `@amykit/cli`'s `prepack`, so it happens on `npm publish` and on
// `npm pack` and nowhere else. `npm install` does not run it, which is why a
// checkout has no stamp and reports `dev`.
//
// It refuses to write a stamp for a tree that has uncommitted changes. A
// version number attached to code nobody committed is the one thing the stamp
// exists to prevent: the log line would look joinable to a release and would
// name work that only ever existed on one laptop.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
const out = process.argv[2] ?? path.join(repo, "packages", "cli", "dist", "stamp.json");

function git(...args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function refuse(why) {
  process.stdout.write(`no stamp written: ${why}\n`);
  // Removed rather than left: a stale stamp from an earlier pack would be
  // worse than none, because it would name a build this one is not.
  fs.rmSync(out, { force: true });
  process.exit(0);
}

let commit;
try {
  commit = git("rev-parse", "--short", "HEAD");
} catch {
  refuse("this is not a git repository, so there is no commit to name");
}

try {
  git("diff", "--quiet", "HEAD");
} catch {
  refuse("the tree has uncommitted changes, so the version would be a claim about nothing");
}

const version = JSON.parse(
  fs.readFileSync(path.join(repo, "packages", "cli", "package.json"), "utf-8"),
).version;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `${JSON.stringify({ version, commit, builtAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") }, null, 2)}\n`,
  "utf-8",
);

process.stdout.write(`stamped ${version}+${commit}\n`);
