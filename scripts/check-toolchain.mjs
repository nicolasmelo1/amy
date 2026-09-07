// Checks that everything naming the `sf` version names the same one.
//
// This exists because of a real failure. `catalog.lock.json` moved to 0.4.0
// and `CONTRIBUTING.md` was updated to match, but the workflow still
// installed v0.3.0. One rule regenerates `docs/rules.md` and compares, so CI
// rebuilt it with the older catalog and reported the committed file as a
// locked artifact edited by hand — a hash mismatch with nothing in the
// repository actually out of step, and nothing on a laptop able to reproduce
// it, because a laptop had the newer `sf`.
//
// The lock is the source of truth: it is what `sf lock` writes and what
// L2.CATALOG_ONLY_TIGHTENS reads. Everything else quotes it, so everything
// else is checked against it.
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(repo, relative), "utf8");

const WORKFLOW = ".github/workflows/software-factory.yml";
const CONTRIBUTING = "CONTRIBUTING.md";
const SETUP = "scripts/setup-dev.sh";

const locked = JSON.parse(read(".software-factory/catalog.lock.json")).sf_version;
const problems = [];

if (!locked) {
  console.error(".software-factory/catalog.lock.json names no sf_version.");
  process.exit(1);
}

/** Every `--tag vX.Y.Z` in a file, with the line it sits on. */
function pinsIn(relative) {
  return read(relative)
    .split("\n")
    .flatMap((line, index) => {
      const found = line.match(/--tag\s+v(\d+\.\d+\.\d+)/);
      return found ? [{ line: index + 1, version: found[1] }] : [];
    });
}

// The setup script is held to the opposite standard: it must *derive* the
// version rather than quote one, because a copy it had to keep in step would
// be one more place to forget. A literal pin creeping in here is the drift
// starting again.
const setup = read(SETUP);

for (const pin of pinsIn(SETUP)) {
  problems.push(
    `${SETUP}:${pin.line} hard-codes sf v${pin.version}. It reads the version from ` +
      `the catalog lock instead, so this would be a fourth copy to keep in step.`,
  );
}

if (!setup.includes("catalog.lock.json")) {
  problems.push(`${SETUP} does not read the version from the catalog lock, so it can drift`);
}

for (const relative of [WORKFLOW, CONTRIBUTING]) {
  const pins = pinsIn(relative);

  if (pins.length === 0) {
    problems.push(`${relative} pins no sf version, so nothing keeps it in step with the lock`);
    continue;
  }

  for (const pin of pins) {
    if (pin.version !== locked) {
      problems.push(
        `${relative}:${pin.line} installs sf v${pin.version}, and the catalog lock ` +
          `records ${locked}. The two disagreeing is invisible on a laptop that ` +
          `already has the newer one, and red in CI.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("The sf version is not the same everywhere it is written:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\nThe lock is the source of truth. Bump the others to match it, or run " +
      "`sf lock` with the version you mean installed.",
  );
  process.exit(1);
}

console.log(`sf v${locked}: the workflow and CONTRIBUTING.md match the lock, and the setup script reads it`);
