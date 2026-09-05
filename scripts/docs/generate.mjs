#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DOCS, ROOT, docFiles } from "./lib/repo.mjs";
import { blocksIn, splice } from "./lib/markdown.mjs";
import { blocksFrom, skillFacts } from "./blocks.mjs";
import { coreFacts } from "./sources/core.mjs";
import { cliFacts } from "./sources/cli.mjs";
import { packageFacts } from "./sources/packages.mjs";
import { factoryFacts } from "./sources/factory.mjs";
import { configFacts } from "./sources/config.mjs";
import { releaseFacts } from "./sources/releases.mjs";
import { manifestFrom } from "./render/manifest.mjs";
import { readmesFrom } from "./render/readme.mjs";

/**
 * Writes the half of the documentation that is derived from the code.
 *
 * Two modes, and the second is the one that matters. `--check` writes
 * nothing and exits non-zero naming every file that would have changed, so a
 * plugin that gains a setting cannot reach main with a reference page still
 * describing the old one. The gate runs it; nobody has to remember.
 */
async function main() {
  const check = process.argv.includes("--check");

  const facts = {
    core: coreFacts(),
    cli: cliFacts(),
    packages: await packageFacts(),
    factory: factoryFacts(),
    config: configFacts(),
    releases: releaseFacts(),
    skills: skillFacts(),
  };

  const unbuilt = facts.packages.filter((entry) => entry.kind === "unbuilt");
  if (unbuilt.length > 0) {
    fail([
      "the documentation is generated from the built packages, and some are not built:",
      ...unbuilt.map((entry) => `  ${entry.name}: ${entry.problem}`),
      "",
      "  run `npm run build` first",
    ]);
  }

  const unloadable = facts.packages.filter((entry) => entry.kind === "unloadable");
  if (unloadable.length > 0) {
    fail([
      "these packages are built and will not load, so nothing can be said about them:",
      ...unloadable.map((entry) => `  ${entry.name}: ${entry.problem}`),
    ]);
  }

  const refused = facts.packages.filter((entry) => entry.registerProblem);
  if (refused.length > 0) {
    fail([
      "these plugins refused to register against a stand-in host, so what they mount",
      "cannot be reported:",
      ...refused.map((entry) => `  ${entry.name}: ${entry.registerProblem}`),
    ]);
  }

  const blocks = blocksFrom(facts);
  const written = [];
  const problems = [];

  const pages = spliceDocs(blocks, problems);
  const spliced = new Map(pages.map((page) => [page.file, page.text]));

  written.push(...pages);
  written.push(...readmesFrom(facts));
  written.push({ file: "docs/manifest.json", text: manifestFrom(facts, blocks, spliced) });

  if (problems.length > 0) fail(problems);

  const stale = written.filter((entry) => current(entry.file) !== entry.text);

  if (check) {
    if (stale.length === 0) {
      console.log(`docs are in step with the code (${written.length} generated files)`);
      return;
    }

    fail([
      "the code moved and the documentation did not. These are out of date:",
      ...stale.map((entry) => `  ${entry.file}`),
      "",
      "  run `npm run docs:generate` and commit the result",
    ]);
  }

  for (const entry of stale) {
    fs.mkdirSync(path.dirname(path.join(ROOT, entry.file)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, entry.file), entry.text);
    console.log(`  wrote ${entry.file}`);
  }

  console.log(
    stale.length === 0
      ? `nothing to do — ${written.length} generated files already in step`
      : `${stale.length} of ${written.length} generated files updated`,
  );
}

/**
 * Puts every block into the page that asks for it.
 *
 * A page keeps everything outside its markers, so the prose belongs to
 * whoever wrote it. A block nothing places is refused: an unplaced reference
 * table is a fact the documentation has and does not show, which is the same
 * failure as one that is out of date.
 */
function spliceDocs(blocks, problems) {
  const written = [];
  const placed = new Set();

  for (const relative of docFiles()) {
    const file = path.join(DOCS, relative);
    const before = fs.readFileSync(file, "utf8");

    const named = blocksIn(before);
    if (named.length === 0) continue;
    for (const name of named) placed.add(name);

    const outcome = splice(before, blocks, `docs/${relative}`);
    problems.push(...outcome.problems);
    written.push({ file: `docs/${relative}`, text: outcome.text });
  }

  for (const name of Object.keys(blocks).sort()) {
    if (!placed.has(name)) {
      problems.push(`the generated block \`${name}\` is produced and no page places it`);
    }
  }

  return written;
}

function current(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function fail(lines) {
  console.error(`docs: ${lines[0]}`);
  for (const line of lines.slice(1)) console.error(line);
  process.exit(1);
}

await main();
