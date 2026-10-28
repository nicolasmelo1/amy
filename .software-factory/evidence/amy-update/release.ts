// Publishes a release of this checkout under another version: every
// `@amykit/*` tarball the installer packed, restamped at <version> with its
// first-party dependencies at `^<version>`, the way the fixed group releases
// them. The CLI's skill carries the version it shipped with, so the scenario
// can tell the skills the new CLI wrote from the old ones, and its stamp
// answers `--version`.
//
// `--broken <name>` ships that package with an entry that
// exports no `plugin`: a release whose plugin refuses to import.
//
// Usage: tsx release.ts <packages-dir> <version> <out-dir> [--broken <name>]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [packages, version, out, flag, brokenName] = process.argv.slice(2);
if (packages === undefined || version === undefined || out === undefined || (flag !== undefined && flag !== "--broken")) {
  console.error("usage: release.ts <packages-dir> <version> <out-dir> [--broken <name>]");
  process.exit(2);
}

interface Manifest {
  name: string;
  version: string;
  main?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Runs a command and stops the whole release when it fails. */
function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

/** First-party ranges moved to the release; everything else as it was. */
function restamped(ranges: Record<string, string> | undefined): Record<string, string> | undefined {
  if (ranges === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(ranges).map(([name, range]) => [name, name.startsWith("@amykit/") ? `^${version}` : range]),
  );
}

/** The CLI's own marks: the skill names its version, the stamp answers `--version`. */
function markCli(root: string): void {
  const skill = path.join(root, "skills", "amy", "SKILL.md");
  fs.writeFileSync(skill, fs.readFileSync(skill, "utf-8").replace(/^version: .*$/m, `version: ${version}\nprovenance: release-${version}`));
  fs.writeFileSync(
    path.join(root, "dist", "stamp.json"),
    `${JSON.stringify({ version, commit: "scenario", builtAt: "2026-10-28T00:00:00.000Z" })}\n`,
  );
}

fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-release-"));
try {
  for (const file of fs.readdirSync(packages).filter((entry) => entry.startsWith("amykit-") && entry.endsWith(".tgz"))) {
    const unpacked = path.join(scratch, file);
    fs.mkdirSync(unpacked);
    run("tar", ["xzf", path.join(packages, file), "-C", unpacked]);
    const root = path.join(unpacked, "package");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as Manifest;
    manifest.version = version;
    manifest.dependencies = restamped(manifest.dependencies);
    manifest.peerDependencies = restamped(manifest.peerDependencies);
    fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    if (manifest.name === "@amykit/cli") markCli(root);
    if (manifest.name === brokenName) fs.writeFileSync(path.join(root, manifest.main ?? "index.js"), "export const broken = true;\n");
    run("npm", ["pack", "--ignore-scripts", "--pack-destination", out], root);
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
