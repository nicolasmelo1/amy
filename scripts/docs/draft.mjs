#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { DOCS, ROOT, docFiles } from "./lib/repo.mjs";
import { packageFacts } from "./sources/packages.mjs";
import { coreFacts } from "./sources/core.mjs";

/**
 * Drafts the prose for a surface nothing has written about yet.
 *
 * Everything the gate enforces is deterministic and lives in `generate.mjs`.
 * This is the other half, and it is deliberately outside the gate: a generated
 * table is a fact, and generated prose is a draft.
 *
 * It has no HTTP client and no API key of its own. It mounts **amy's own
 * harness plugins** and asks through the `agent` port, so a draft goes up the
 * same ladder, under the same ceiling, into the same event log as everything
 * else amy does. That is the point as much as the drafts are: a plugin model
 * that only works for the engine it was written for does not work.
 */
async function main() {
  const write = process.argv.includes("--write");
  const gaps = await findGaps();

  if (gaps.length === 0) {
    console.log("nothing undocumented — every port, plugin and workflow has a page that names it");
    return;
  }

  console.log(`${gaps.length} thing(s) with no prose:`);
  for (const gap of gaps) console.log(`  ${gap.kind}: ${gap.subject}`);

  const ask = await harness();
  if (!ask) {
    console.error("");
    console.error("no harness is mounted, so nothing can draft. Configure `agent.ladder` in");
    console.error("~/.amy/config.yaml, or install one of @amy/plugin-claude, -codex, -hermes-agent.");
    process.exit(1);
  }

  for (const gap of gaps) {
    console.log(`\n── ${gap.subject}`);
    const reply = await ask(promptFor(gap), ROOT, { step: "draft-docs" });

    if (!write) {
      console.log(reply.text);
      continue;
    }

    const file = path.join(DOCS, gap.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${reply.text.trim()}\n`);
    console.log(`  wrote docs/${gap.file} — review it before committing`);
  }

  if (!write) console.log("\n(nothing written — pass --write to save these as pages)");
}

/**
 * What the code has and the prose does not mention.
 *
 * Deliberately crude: a surface is "documented" when some page names it. That
 * is a low bar and it is the right one — this looks for the page that does not
 * exist, not for the paragraph that is thin, and judging the second is a
 * person's job.
 */
async function findGaps() {
  const packages = await packageFacts();
  const core = coreFacts();
  const prose = docFiles()
    .map((relative) => fs.readFileSync(path.join(DOCS, relative), "utf8"))
    .join("\n");

  const gaps = [];

  for (const entry of packages) {
    if (entry.kind !== "plugin" && entry.kind !== "workflow") continue;
    if (prose.includes(entry.name)) continue;

    gaps.push({
      kind: entry.kind,
      subject: entry.name,
      file: `reference/${slug(entry.name)}.md`,
      facts: entry,
    });
  }

  for (const port of core.ports) {
    if (prose.includes(port.interface)) continue;
    gaps.push({
      kind: "contract",
      subject: port.interface,
      file: `concepts/${slug(port.interface)}.md`,
      facts: port,
    });
  }

  return gaps;
}

function promptFor(gap) {
  return [
    "You are writing one page of documentation for amy, a state machine that runs",
    "under agent harnesses, where every part of it is a plugin.",
    "",
    "House style, and it is not negotiable:",
    "  - Say WHY, not what. The reference tables already say what.",
    "  - Name the failure a decision exists to prevent. Nearly every design",
    "    decision here exists because something went wrong.",
    "  - British spelling. No exclamation marks. No 'simply', no 'just', no",
    "    'powerful', no 'seamless', no marketing.",
    "  - Never state a fact you cannot see in the input below. If you do not know",
    "    something, leave it out rather than guessing.",
    "  - Front matter with title, description, group and order.",
    "",
    `Write the page for: ${gap.subject}`,
    "",
    "Here is everything that is known about it, read out of the code:",
    "",
    "```json",
    JSON.stringify(gap.facts ?? {}, null, 2),
    "```",
    "",
    "Output the markdown page and nothing else. Do not include a generated block",
    "marker: the reference tables are produced by a separate deterministic step.",
  ].join("\n");
}

/**
 * amy's own harnesses, mounted through amy's own registry.
 *
 * Read from the operator's config so the ladder, the model tiers and the
 * budget are the ones they already chose, rather than a second set of settings
 * that exists only for this script.
 */
async function harness() {
  const home = process.env.AMY_HOME ?? path.join(process.env.HOME ?? "", ".amy");

  let core;
  let config;
  try {
    core = await import("@amy/core");
    config = readConfig(home);
  } catch {
    return null;
  }

  const specs = config.ladderPlugins;
  const plugins = [];

  for (const spec of specs) {
    try {
      const module = await import(spec);
      if (module.plugin) plugins.push(module.plugin);
    } catch {
      // A harness this machine does not have is not an error here: the next
      // one on the ladder is what a ladder is for.
    }
  }

  if (plugins.length === 0) return null;

  const outcome = await core.mount(plugins, config.slices, {
    runner: new core.NodeCommandRunner(),
    now: () => new Date(),
    log: undefined,
    paths: { workspace: ROOT, state: home },
  });

  if (!outcome.ok) {
    console.error("the harnesses would not mount:");
    for (const problem of outcome.problems) console.error(`  ${problem}`);
    return null;
  }

  const agent = outcome.mounted.ports.get("agent");
  if (!agent || typeof agent.ask !== "function") return null;

  return (prompt, cwd, context) => agent.ask(prompt, cwd, context);
}

/** The operator's config, reduced to what mounting a harness needs of it. */
function readConfig(home) {
  const file = path.join(home, "config.yaml");
  const parsed = (fs.existsSync(file) ? yaml.parse(fs.readFileSync(file, "utf8")) : {}) ?? {};

  const ladder = parsed?.agent?.ladder ?? [];
  const harnesses = [...new Set(ladder.map((rung) => String(rung).split(":")[0]))];

  const known = {
    claude: "@amy/plugin-claude",
    codex: "@amy/plugin-codex",
    hermes: "@amy/plugin-hermes-agent",
  };

  const chosen = harnesses.map((name) => known[name]).filter(Boolean);

  return {
    ladderPlugins: [
      ...(chosen.length > 0 ? chosen : Object.values(known)),
      "@amy/plugin-agent-relay",
    ],
    slices: parsed?.plugins ?? {},
  };
}


function slug(name) {
  return name.replace(/^@[^/]+\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

await main();
