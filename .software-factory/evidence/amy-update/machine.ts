// The edits the amy-update scenario makes to the scratch machine between
// moves: a manifest read, a range re-declared, a config setting flipped.
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
  version: () => version(args[0] ?? ""),
};
const run = step === undefined ? undefined : steps[step];
if (run === undefined) {
  console.error(`usage: machine.ts <${Object.keys(steps).join("|")}> [arguments...]`);
  process.exit(2);
}
run();
