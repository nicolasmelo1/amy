// Checks that a version bump re-locked the dependency manifests and nothing
// else.
//
// Usage: node scripts/check-lock-scope.mjs
//
// `release:version` runs `sf lock`, because bumping twenty-five package.json
// files is a deliberate dependency change and the lock has to move with them
// or the release pull request can never be green.
//
// But `sf lock` takes no scope: it rewrites every lock from whatever is on
// disk. Left alone, that hands a release the power to bless a changed
// `events.json`, `policy.yaml` or `docs/rules.md` in silence — which is the
// one thing those locks exist to prevent, since their whole value is that a
// reviewer sees the diff.
//
// So: run it, then refuse if it touched anything but the dependency lock.
import { execFileSync } from "node:child_process";

const ALLOWED = ".software-factory/locks/dependencies.lock.json";

const changed = execFileSync("git", ["diff", "--name-only", "--", ".software-factory/"], {
  encoding: "utf-8",
})
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const unexpected = changed.filter((file) => file !== ALLOWED);

if (unexpected.length > 0) {
  process.stderr.write("the version bump re-locked more than the dependency manifests:\n");
  for (const file of unexpected) process.stderr.write(`  ${file}\n`);
  process.stderr.write(
    "\nA release may move the dependency lock, because it moves every package.json.\n" +
      "It may not move the others: those hold the event contract, the policy and the\n" +
      "generated artifacts, and their value is that a reviewer sees the diff.\n" +
      "\nLand that change in its own pull request first.\n",
  );
  process.exit(1);
}

process.stdout.write(
  changed.length > 0
    ? "the dependency lock moved with the manifests, and nothing else did\n"
    : "no lock needed moving\n",
);
