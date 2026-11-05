// The edits the amy-update scenario makes to the scratch machine between
// moves, and the reads it makes of it: a range re-declared, a config setting
// flipped, the operator's intent written, the release on disk listed.
//
// Usage: tsx machine.ts <step> [arguments...]
import fs from "node:fs";
import path from "node:path";

const home = process.env.HOME ?? "";
const config = path.join(home, ".amy", "config.yaml");

/** Exits 0 when the installed CLI declares `latest` as its own update range. */
function registryIntent(file: string): void {
  const manifest: { amyUpdateRanges?: Record<string, string> } = JSON.parse(fs.readFileSync(file, "utf-8"));
  process.exit(manifest.amyUpdateRanges?.["@amykit/cli"] === "latest" ? 0 : 1);
}

/** The machine's CLI tarball contents, restamped as the registry's newer 999.0.0. */
function restampCli(root: string): void {
  const manifest: { version: string } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
  manifest.version = "999.0.0";
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const skill = path.join(root, "skills", "amy", "SKILL.md");
  fs.writeFileSync(skill, fs.readFileSync(skill, "utf-8").replace("version: 1.0.0", "version: 999.0.0\nprovenance: replacement-cli-probe"));
  fs.writeFileSync(
    path.join(root, "dist", "stamp.json"),
    `${JSON.stringify({ version: "999.0.0", commit: "scenario", builtAt: "2026-09-24T00:00:00.000Z" })}\n`,
  );
}

/** Re-declares the workflow's pin as the range it came from. */
function pinRange(): void {
  const file = path.join(home, ".amy", "plugins", "package.json");
  const manifest: { dependencies: Record<string, string>; overrides?: Record<string, string> } = JSON.parse(
    fs.readFileSync(file, "utf8"),
  );
  manifest.dependencies["@acme/workflow-oncall"] = "^1.0.0";
  manifest.overrides = { ...(manifest.overrides ?? {}) };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}

/** An after-timing, every-run schedule, replacing whatever schedule was there. */
function autoUpdateAfter(): void {
  const n = "\n";
  const block = "autoUpdate:" + n + "  enabled: true" + n + "  timing: after" + n + "  everyRuns: 1";
  const schedule = /autoUpdate:[^]*?everyRuns: [0-9]+/;
  const text = fs.readFileSync(config, "utf8");
  fs.writeFileSync(config, schedule.test(text) ? text.replace(schedule, block) : text + n + block + n);
}

/** Each `<from> <to>` pair replaced once in the config, in order. */
function replaceInConfig(pairs: string[]): void {
  let text = fs.readFileSync(config, "utf8");
  for (let i = 0; i + 1 < pairs.length; i += 2) text = text.replace(pairs[i] ?? "", pairs[i + 1] ?? "");
  fs.writeFileSync(config, text);
}

/** A second profile naming a package that is not installed. */
function addAfterhours(): void {
  const lines = fs.readFileSync(config, "utf8").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    kept.push(line);
    if (line.trim() === "workflows:") {
      kept.push("  afterhours:");
      kept.push("    workflow: \"@acme/workflow-afterhours\"");
    }
  }
  fs.writeFileSync(config, kept.join("\n"));
}

/** The profiles reading the roster and every retired top-level key, named where the machine's config names its workflows. */
function addTickets(): void {
  const lines = fs.readFileSync(config, "utf8").split("\n");
  const kept: string[] = [];
  let spliced = false;
  for (const line of lines) {
    kept.push(line);
    if (!spliced && line.trim() === "workflows:") {
      kept.push("  tickets:");
      kept.push('    workflow: "@amykit/workflow-ticket-to-qa"');
      kept.push("  plans:");
      kept.push('    workflow: "@amykit/workflow-note-to-plan"');
      kept.push("  errands:");
      kept.push('    workflow: "@amykit/workflow-errand"');
      spliced = true;
    }
  }
  if (!spliced) {
    console.error("the config names no workflows block");
    process.exit(1);
  }
  let text = kept.join("\n");
  // The vocabulary an older release kept at the top level, written the way
  // this machine's own workflows read them at their version: the ticket's
  // ceilings, the planner's repositories and its check, the errand's, and the
  // tracker's status name and team map. The update is what re-homes all of
  // it, so this is the pre-move state the assertions prove moved.
  const wanted: [RegExp, string][] = [
    [/^qaStatusName:/m, "qaStatusName: In QA"],
    [/^workingStatusName:/m, "workingStatusName: In Progress"],
    [/^repoByTeam:/m, "repoByTeam:\n  BILL: example.test/gadgets"],
    [/^repos:/m, "repos:\n  - example.test/gadgets"],
    [/^workspaceRoot:/m, "workspaceRoot: /workspaces/gadgets"],
    [/^gate:/m, [
      "# The deterministic gate, kept at the top level the way an older",
      "# release carried it.",
      "gate:",
      "  default:",
      '    - echo "the gate"',
    ].join("\n")],
    [/^worktrees:/m, [
      "# The worktrees, kept at the top level the way an older release",
      "# carried them.",
      "worktrees:",
      "  retentionDays: 9",
    ].join("\n")],
    [/^policy:/m, [
      "# The ceilings the ticket workflow's decisions read, kept at the top",
      "# level the way an older release carried them.",
      "policy:",
      "  maxImplementAttempts: 3",
      "  pollBackoffMs: 0",
      "  rosterBackoffMs: 0",
    ].join("\n")],
    [/^plans:/m, [
      "# The planner's repositories, and the check that judges a plan.",
      "plans:",
      "  repos:",
      "    - example.test/gadgets",
      "  check:",
      "    default:",
      '      - echo "the plan check"',
    ].join("\n")],
    [/^errands:/m, [
      "# The ceilings the errand's own decisions read.",
      "errands:",
      "  policy:",
      "    maxAttempts: 2",
      "    maxInFlight: 3",
      "    ceilingBackoffMs: 0",
    ].join("\n")],
  ];
  for (const [marker, block] of wanted) {
    if (!marker.test(text)) text += `\n${block}`;
  }
  fs.writeFileSync(config, text);
}

/** The team an older install kept for the machine, before profiles carried one. */
function rootRoster(): void {
  const today = new Date().toISOString().slice(0, 10);
  const body = [
    "confirmedOn: " + today,
    "reviewers:",
    "  - tracker: sam@example.test",
    "    host: sam",
    "    available: true",
    "  - tracker: kim@example.test",
    "    host: kim",
    "    available: false",
    "qa:",
    "  tracker: lee@example.test",
    "  host: lee",
    "  available: true",
  ].join("\n");
  fs.mkdirSync(path.join(home, ".amy"), { recursive: true });
  fs.writeFileSync(path.join(home, ".amy", "roster.yaml"), `${body}\n`, "utf-8");
}

/**
 * A project the way a machine before the walk named it: three profiles,
 * one per phase folder, each naming the folder beside the last. The phase
 * modules are declared workflows importing the core the machine installed,
 * by absolute URL, because a project tree resolves no package of its own.
 */
function addProjectPhases(): void {
  const work = path.dirname(home);
  const root = path.join(work, "project");
  const core = path.join(home, ".amy", "plugins", "node_modules", "@amykit", "core", "dist", "index.js");
  if (!fs.existsSync(core)) {
    console.error(`the machine's core is not installed where the modules import it: ${core}`);
    process.exit(1);
  }
  const coreUrl = `file://${core.replaceAll("\\", "/")}`;
  for (const phase of ["brief", "workflow", "prove"] as const) {
    const directory = path.join(root, phase);
    fs.mkdirSync(directory, { recursive: true });
    const name = phase === "workflow" ? "project-work" : `project-${phase}`;
    fs.writeFileSync(path.join(directory, "index.js"), [
      `import { defineWorkflow } from ${JSON.stringify(coreUrl)};`,
      `export const plugin = defineWorkflow({`,
      `  name: ${JSON.stringify(name)},`,
      `  pluginName: ${JSON.stringify(`workflow-${name}`)},`,
      `  states: ["SETTLED"],`,
      `  terminal: ["SETTLED"],`,
      `  configSchema: {}, policy: {}, needs: {}, record: () => ({}),`,
      `  discover: async () => [], observe: async () => ({}), actions: {},`,
      `  decide: { SETTLED: () => ({ kind: "settled", why: "fixture" }) },`,
      `});`,
      ``,
    ].join("\n"), "utf-8");
  }
  const lines = fs.readFileSync(config, "utf8").split("\n");
  // The selector rides at the top level: the machine's own selector is
  // rewritten to name the folded-away brief phase, wherever the file says
  // it now — and none is inserted where the file already says one.
  const saidDefault = lines.some((line: string) => /^defaultWorkflow:/.test(line.trim()) && !line.trim().startsWith("#"));
  const kept: string[] = [];
  let spliced = false;
  for (const line of lines) {
    if (/^defaultWorkflow:/.test(line.trim())) {
      kept.push("defaultWorkflow: grooming");
      continue;
    }
    if (!spliced && line.trim() === "workflows:") {
      if (!saidDefault) kept.push("defaultWorkflow: grooming");
      kept.push(line);
      kept.push("  grooming:");
      kept.push(`    workflow: ${path.join(root, "brief")}`);
      kept.push("  execution:");
      kept.push(`    workflow: ${path.join(root, "workflow")}`);
      kept.push("  proving:");
      kept.push(`    workflow: ${path.join(root, "prove")}`);
      kept.push("    plugins:");
      kept.push('      - "@amykit/plugin-file-tasks"');
      spliced = true;
      continue;
    }
    kept.push(line);
  }
  if (!spliced) {
    console.error("the config names no workflows block");
    process.exit(1);
  }
  fs.writeFileSync(config, kept.join("\n"));
}

/** The broken profile gone again. */
function dropAfterhours(): void {
  const lines = fs.readFileSync(config, "utf8").split("\n");
  const kept: string[] = [];
  let inAfterhours = false;
  for (const line of lines) {
    if (line.includes("afterhours:")) { inAfterhours = true; continue; }
    if (inAfterhours && (line.startsWith("    ") || line.trim() === "")) continue;
    inAfterhours = false;
    kept.push(line);
  }
  fs.writeFileSync(config, kept.join("\n"));
}

/**
 * Every first-party version on disk under the given `node_modules` trees,
 * nested copies included, one `name@version` a line — and then each
 * first-party entry of the plugins root's manifest as `manifest name spec`.
 */
function releaseOnDisk(trees: string[]): void {
  const found = new Set<string>();
  const seen = new Set<string>();
  // Every package directory is descended into, not only `@amykit/*` ones: a
  // third-party workflow's own `node_modules` can hold an older
  // `@amykit/core`, and a walk that skipped it would call a mixed tree one
  // release.
  const packagesIn = (modules: string): string[] => {
    if (!fs.existsSync(modules)) return [];
    return fs.readdirSync(modules, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith(".") || !(entry.isDirectory() || entry.isSymbolicLink())) return [];
      const directory = path.join(modules, entry.name);
      return entry.name.startsWith("@") ? packagesIn(directory) : [directory];
    });
  };
  const walk = (modules: string): void => {
    for (const directory of packagesIn(modules)) {
      const real = fs.realpathSync(directory);
      if (seen.has(real)) continue;
      seen.add(real);
      const manifest = path.join(directory, "package.json");
      if (fs.existsSync(manifest)) {
        const { name, version }: { name: string; version: string } = JSON.parse(fs.readFileSync(manifest, "utf-8"));
        if (name.startsWith("@amykit/")) found.add(`${name}@${version}`);
      }
      walk(path.join(directory, "node_modules"));
    }
  };
  for (const tree of trees) walk(tree);
  for (const one of [...found].sort()) console.log(one);
  const plugins: { dependencies?: Record<string, string> } = JSON.parse(
    fs.readFileSync(path.join(home, ".amy", "plugins", "package.json"), "utf-8"),
  );
  for (const [name, spec] of Object.entries(plugins.dependencies ?? {})) {
    if (name.startsWith("@amykit/")) console.log(`manifest ${name} ${spec}`);
  }
}

/** Writes the operator's registry intent for the CLI into the plugins root, or removes it. */
function setIntent(range: string | undefined): void {
  const file = path.join(home, ".amy", "plugins", "package.json");
  const manifest: { amyUpdateRanges?: Record<string, string> } = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (range === undefined) delete manifest.amyUpdateRanges;
  else manifest.amyUpdateRanges = { "@amykit/cli": range };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Prints the version a package.json declares. */
function version(file: string): void {
  const manifest: { version: string } = JSON.parse(fs.readFileSync(file, "utf-8"));
  console.log(manifest.version);
}

const [step, ...args] = process.argv.slice(2);
const steps: Record<string, () => void> = {
  "registry-intent": () => registryIntent(args[0] ?? ""),
  "restamp-cli": () => restampCli(args[0] ?? ""),
  "pin-range": pinRange,
  "auto-update-after": autoUpdateAfter,
  "replace-in-config": () => replaceInConfig(args),
  "add-afterhours": addAfterhours,
  "drop-afterhours": dropAfterhours,
  "add-tickets": addTickets,
  "root-roster": rootRoster,
  "add-project-phases": addProjectPhases,
  version: () => version(args[0] ?? ""),
  "release-on-disk": () => releaseOnDisk(args),
  "set-intent": () => setIntent(args[0]),
};
const run = step === undefined ? undefined : steps[step];
if (run === undefined) {
  console.error(`usage: machine.ts <${Object.keys(steps).join("|")}> [arguments...]`);
  process.exit(2);
}
run();
