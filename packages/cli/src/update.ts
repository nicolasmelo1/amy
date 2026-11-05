import fs from "node:fs";
import yaml from "yaml";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRunner } from "@amykit/core";
import { PLUGINS_ROOT_FLAGS, packageManager, shellCommand } from "./install.js";
import { paths } from "./paths.js";
import { type AmyConfig, DEFAULT_CONFIG } from "./config.js";
import { type Profile } from "./profiles.js";
import { pluginList } from "./slices.js";

/**
 * One package this machine's two roots hold, and what the range in them
 * points at.
 *
 * The two roots are the plugins root — `<home>/plugins`, where the config's
 * packages are installed — and the install root that resolved the CLI
 * itself. The version installed is read off the copy on disk. The version
 * the range points at is asked of the range, through npm, which is what
 * makes an update an answer rather than a guess.
 */
export interface Held {
  /** The package the root's manifest names. */
  readonly name: string;
  /** The spec in the root's manifest: the range this install pinned. */
  readonly range: string;
  /** Which of the two roots holds it. */
  readonly root: "plugins" | "install";
  /** The version on disk right now. */
  readonly have: string;
  /** What the range now points at; nothing when npm could not be asked. */
  readonly want?: string;
  /**
   * The manifest entry as the root held it before this update, which is
   * what a rollback writes back. Nothing for a global root, which keeps no
   * manifest.
   */
  readonly spec?: string;
}

/**
 * A root npm installs into: a directory with its own manifest, or npm's
 * global prefix, which has none.
 *
 * `dir` is what npm is pointed at — the root itself, or the prefix for
 * `--global` — and `modules` is where the packages it installs land: the
 * root's own `node_modules`, or the global root npm reports.
 */
export interface Root {
  readonly kind: "local" | "global";
  readonly dir: string;
  readonly modules: string;
}

/** A root with its own manifest, whose packages sit in its own `node_modules`. */
export function localRoot(dir: string): Root {
  return { kind: "local", dir, modules: path.join(dir, "node_modules") };
}

/**
 * The release the machine moves to: every first-party package, in both
 * roots, at one version.
 *
 * `@amykit/*` is released as one fixed group, so the packages always share a
 * version and a machine holding two of them is half-updated by definition.
 * The release is asked once, of the CLI's registry intent, rather than of
 * each package's caret — on 0.x a caret never crosses a minor, and while
 * this project is on 0.x every release is a minor.
 */
export interface Release {
  /** What the intent resolves to: the version every first-party package moves to. */
  readonly version: string;
  /** The CLI's registry intent it was resolved from. */
  readonly intent: string;
  /** The newest published release, when the intent holds the machine below it. */
  readonly newest?: string;
}

/** What `update` reads off a machine: every package held, and the release. */
export interface Survey {
  readonly held: Held[];
  readonly release?: Release;
}

/** Whether a package is one of this project's own, released in lockstep. */
export function firstParty(name: string): boolean {
  return name.startsWith("@amykit/");
}

/** What one root's manifest asks npm for, by direct package name. */
export function manifestOf(root: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const dependencies = parsed.dependencies;
    return typeof dependencies === "object" && dependencies !== null
      ? { ...(dependencies as Record<string, string>) }
      : {};
  } catch {
    return {};
  }
}

/**
 * The registry intent an installed machine carries beside a local tarball.
 *
 * `install.sh` must bootstrap unpublished packages from local tarballs, but
 * the CLI itself still has a registry lifecycle after it is published. This
 * metadata keeps the bootstrap source as the manifest dependency while giving
 * `amy update` the explicit range it may safely resolve and install.
 */
export function updateRangeOf(root: string, name: string, fallback: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as {
      amyUpdateRanges?: Record<string, unknown>;
    };
    const range = parsed.amyUpdateRanges?.[name];
    return typeof range === "string" ? range : fallback;
  } catch {
    return fallback;
  }
}

/** The version one root's copy of a package carries, or nothing when it is not there. */
export function versionIn(root: string, name: string): string | undefined {
  return versionAt(path.join(root, "node_modules"), name);
}

/** The version the copy under one `node_modules` carries, or nothing. */
function versionAt(modules: string, name: string): string | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(modules, ...name.split("/"), "package.json"), "utf-8"),
    ) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a manifest range can move at all.
 *
 * `file:` specs, URLs, git forms and paths are pins: what they name is one
 * place on one machine, and what would move is whatever that place holds
 * now, which no command can discover. A bare name or a semver range is a
 * registry range, and `latest` is one too — an operator who wrote it wants
 * the newest one npm finds. The tilde of `~2.1.0` is a range; only a tilde
 * followed by a slash is a path into the home directory. Spaces do not make
 * a range a pin: `>=1.0.0 <2.0.0` is one registry range npm answers as a
 * whole, and the prefixes above already name every pin form.
 */
export function isRange(range: string): boolean {
  return !(
    /^(?:file:|https?:\/\/|git:\/\/|git\+(?:ssh|https?|file):\/\/|ssh:\/\/|github:|gitlab:|bitbucket:|gist:)/.test(range) ||
    /^[^:/]+@[^:/]+:/.test(range) ||
    /^(?:\/|\.{1,2}\/|~(?:\/|$)|[A-Za-z]:[\\/])/.test(range)
  );
}

/**
 * The version a range points at, asked through npm.
 *
 * `npm view <name>@<range> version` is the question in npm's own words; its
 * answer is the version that satisfies the range today. A machine with no
 * network, or a range npm cannot read, gets an unset `want` rather than a
 * guess, and `--check` reports it as unknown rather than as current.
 */
async function resolveTo(
  runner: CommandRunner,
  name: string,
  range: string,
): Promise<string | undefined> {
  const result = await runner.run(packageManager(), ["view", `${name}@${range}`, "version", "--json"], {
    timeoutMs: 60 * 1000,
  });
  if (!result.ok) return undefined;
  return oneVersion(result.stdout);
}

/** The one version npm reported, when that is what it reported. */
export function oneVersion(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (typeof parsed === "string") return parsed;
    // A range that matches several answers with the list, oldest first; the
    // newest one is what the range moves to.
    if (Array.isArray(parsed)) {
      const versions = parsed.filter((entry): entry is string => typeof entry === "string");
      return versions[versions.length - 1];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Every package this machine's two roots hold, with what the ranges in them
 * now point at, and the release the first-party ones move to.
 *
 * A third-party package moves within the range the operator wrote: a 0.x
 * workflow at `^0.1.0` does not jump to 0.2.0, because that is the
 * operator's call. A first-party one moves to the release, whatever caret
 * npm saved for it, and never backwards: a copy already past the release is
 * held where it is.
 */
export async function survey(runner: CommandRunner, home: string, install?: Root): Promise<Survey> {
  const pluginsRoot = path.join(home, "plugins");
  const intent = cliIntent(pluginsRoot, install);
  // Asked once, and only when a first-party package is held at all.
  let release: Release | undefined;
  let asked: Promise<Release | undefined> | undefined;
  const wantFor = async (name: string, range: string, have: string): Promise<string | undefined> => {
    if (!isRange(range)) return undefined;
    if (!firstParty(name) || intent === undefined) return resolveTo(runner, name, range);
    asked ??= releaseFor(runner, intent);
    release = await asked;
    if (release === undefined) return undefined;
    return compareVersions(release.version, have) > 0 ? release.version : have;
  };
  const found: Held[] = [];

  for (const [name, spec] of Object.entries(manifestOf(pluginsRoot))) {
    const have = versionIn(pluginsRoot, name);
    if (!have) continue;
    found.push({ name, range: spec, root: "plugins", have, want: await wantFor(name, spec, have), spec });
  }

  if (install?.kind === "local") {
    for (const [name, dependency] of Object.entries(manifestOf(install.dir))) {
      const range = updateRangeOf(install.dir, name, dependency);
      const have = versionAt(install.modules, name);
      if (!have) continue;
      found.push({ name, range, root: "install", have, want: await wantFor(name, range, have), spec: dependency });
    }
  } else if (install?.kind === "global") {
    // A global prefix keeps no manifest: the CLI is the one package amy put
    // there, and what it moves to is the release.
    const have = versionAt(install.modules, CLI);
    if (have) found.push({ name: CLI, range: intent ?? "latest", root: "install", have, want: await wantFor(CLI, intent ?? "latest", have) });
  }

  return release === undefined ? { held: found } : { held: found, release };
}

/** Every package this machine's two roots hold, without the release around them. */
export async function held(runner: CommandRunner, home: string, install?: Root | string): Promise<Held[]> {
  return (await survey(runner, home, typeof install === "string" ? localRoot(install) : install)).held;
}

const CLI = "@amykit/cli";

/**
 * The CLI's registry intent: the range `update` resolves the release from.
 *
 * The operator's own word comes first — `amyUpdateRanges` in the plugins
 * root's manifest, the one manifest a global install has — then the install
 * root's, which is what `install.sh` writes beside its bootstrap tarball,
 * then that root's dependency, and `latest` when nothing says otherwise. A
 * pin is no intent: a CLI installed from a path has no release to reach, and
 * its first-party packages move within their own ranges as before.
 */
function cliIntent(pluginsRoot: string, install: Root | undefined): string | undefined {
  const local = install?.kind === "local" ? install.dir : undefined;
  // The dependency is only an intent when it is a pin. A registry range there
  // is whatever npm saved — or the `^<release>` this command wrote after the
  // last move — and on 0.x that caret would hold the machine on one minor
  // forever, so the intent stays `latest` unless the operator wrote one.
  const dependency = local === undefined ? undefined : manifestOf(local)[CLI];
  const fallback = dependency !== undefined && !isRange(dependency) ? dependency : "latest";
  const fromInstall = local === undefined ? "latest" : updateRangeOf(local, CLI, fallback);
  const intent = updateRangeOf(pluginsRoot, CLI, fromInstall);
  return isRange(intent) ? intent : undefined;
}

/** The release an intent resolves to, and the newest one when the intent holds below it. */
async function releaseFor(runner: CommandRunner, intent: string): Promise<Release | undefined> {
  const version = await resolveTo(runner, CLI, intent);
  if (version === undefined) return undefined;
  if (intent === "latest") return { version, intent };
  const newest = await resolveTo(runner, CLI, "latest");
  return newest !== undefined && compareVersions(newest, version) > 0 ? { version, intent, newest } : { version, intent };
}

/**
 * Versions by SemVer precedence: the three numbers, then a prerelease before
 * its release, then the prerelease identifiers one by one — numeric ones by
 * value and below any alphanumeric one, a shorter list before a longer one
 * it prefixes. Build metadata is ignored. Without the identifiers, `rc.2`
 * and `rc.1` compare equal and a prerelease tag never moves.
 */
export function compareVersions(a: string, b: string): number {
  const split = (version: string) => {
    const [core = "", ...pre] = version.split("+", 1)[0]!.split("-");
    const numbers = core.split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
    return { numbers, pre: pre.length === 0 ? [] : pre.join("-").split(".") };
  };
  const [x, y] = [split(a), split(b)];
  for (let i = 0; i < 3; i += 1) {
    const difference = (x.numbers[i] ?? 0) - (y.numbers[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (x.pre.length === 0 || y.pre.length === 0) return Number(x.pre.length === 0) - Number(y.pre.length === 0);
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i += 1) {
    const difference = compareIdentifiers(x.pre[i]!, y.pre[i]!);
    if (difference !== 0) return difference;
  }
  return x.pre.length - y.pre.length;
}

function compareIdentifiers(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b);
  if (numeric.test(a) !== numeric.test(b)) return numeric.test(a) ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One first-party copy on disk: what it is, and where. */
export interface Copy {
  readonly name: string;
  readonly version: string;
  readonly at: string;
  /** The package whose own `node_modules` holds it; nothing for a root's top level. */
  readonly within?: string;
}

/**
 * Every first-party copy under one `node_modules`, nested copies included.
 *
 * Every package directory is descended into, third-party ones too: a
 * workflow from elsewhere can carry its own `@amykit/core` in its own
 * `node_modules`, and that copy is on the machine as much as the hoisted
 * one. `only` narrows the top level to one package's tree — a global
 * prefix holds the operator's other tools, which are not amy's to read.
 */
export function firstPartyCopies(modules: string, only?: string): Copy[] {
  const found: Copy[] = [];
  const seen = new Set<string>();
  const visit = (directory: string, within: string | undefined): void => {
    const real = realpath(directory);
    if (seen.has(real)) return;
    seen.add(real);
    let own: string | undefined;
    try {
      const { name, version } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (typeof name === "string") own = name;
      if (typeof name === "string" && typeof version === "string" && firstParty(name)) {
        found.push(within === undefined ? { name, version, at: directory } : { name, version, at: directory, within });
      }
    } catch {
      // A directory without a readable manifest is not a package; its
      // `node_modules`, if any, is still walked below.
    }
    walk(path.join(directory, "node_modules"), own ?? within);
  };
  const walk = (tree: string, within: string | undefined): void => {
    for (const directory of packagesIn(tree)) visit(directory, within);
  };
  if (only === undefined) walk(modules, undefined);
  else if (fs.existsSync(path.join(modules, ...only.split("/")))) visit(path.join(modules, ...only.split("/")), undefined);
  return found;
}

/** The package directories directly under one `node_modules`, scoped ones included. */
function packagesIn(modules: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(modules, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.name.startsWith(".") || !(entry.isDirectory() || entry.isSymbolicLink())) return [];
    const directory = path.join(modules, entry.name);
    return entry.name.startsWith("@") ? packagesIn(directory) : [directory];
  });
}

/**
 * The first-party copies a move left above the release.
 *
 * The CLI and each plugin are installed at the release exactly, but what
 * they depend on is a caret: with 0.7.0 the intent and 0.7.1 published, npm
 * answers their `^0.7.0` with 0.7.1, and the machine holds two versions of
 * one group. No flag constrains that for a global install, so the update
 * reads the trees it wrote and refuses to call such a machine moved. A
 * package the survey held past the release is held there on purpose, and is
 * not a stray.
 */
export function aboveRelease(trees: readonly Copy[], release: string, heldPast: ReadonlySet<string>): Copy[] {
  return trees.filter((copy) => !heldPast.has(copy.name) && compareVersions(copy.version, release) > 0);
}

/**
 * The first-party copies a third-party package holds below the release.
 *
 * A workflow from elsewhere that depends on `@amykit/core@^0.6.0` keeps its
 * own 0.6 core when the machine moves to 0.7.0, and nothing this command can
 * install changes that: the range is that package's, and moving it is its
 * author's release, or the operator's choice to drop it. Refusing would hold
 * the whole machine on the old release until somebody else publishes, so
 * these are named rather than refused.
 */
export function belowRelease(trees: readonly Copy[], release: string): Copy[] {
  return trees.filter((copy) => copy.within !== undefined && !firstParty(copy.within) && compareVersions(copy.version, release) < 0);
}

/**
 * Where the plugins root and the install root are, for this running CLI.
 *
 * The plugins root is state, under amy's home. The install root is derived
 * from where this module resolved from: an installed CLI sits at
 * `<modules>/@amykit/cli/dist/`, so the walk up from this file is one level
 * to `dist`, one to the package, one to the scope and one to the
 * `node_modules` holding it. When a manifest sits beside that `node_modules`
 * it is a local root. When none does, npm is asked for its global root —
 * once, and only then — and a match by real path is the global prefix
 * `npm install -g` wrote. Anything else is a checkout (`packages/cli/dist/`
 * never sits under a `node_modules`), and `update` has no CLI half to move
 * there and says so rather than running npm against a repository.
 */
export async function roots(
  home: string,
  runner: CommandRunner,
  from: URL = new URL(import.meta.url),
  platform: NodeJS.Platform = process.platform,
): Promise<{ plugins: string; install?: Root }> {
  const plugins = path.join(home, "plugins");
  const packageDir = path.dirname(path.dirname(fileURLToPath(from)));
  const modules = path.dirname(path.dirname(packageDir));
  if (path.basename(modules) !== "node_modules") return { plugins };
  if (fs.existsSync(path.join(path.dirname(modules), "package.json"))) {
    return { plugins, install: localRoot(path.dirname(modules)) };
  }
  const global = await globalModules(runner);
  if (global === undefined || realpath(global) !== realpath(modules)) return { plugins };
  // The prefix comes from the path npm reported, not from where this module
  // resolved: Node hands an ES module its real path, so a global
  // `node_modules` that is a symlink would put the prefix under the link's
  // target, and every install and rollback would land in the wrong place.
  return { plugins, install: { kind: "global", dir: globalPrefix(global, platform), modules } };
}

/** npm's global `node_modules`, or nothing when npm could not say. */
async function globalModules(runner: CommandRunner): Promise<string | undefined> {
  const result = await runner.run(packageManager(), ["root", "--global"], { timeoutMs: 60 * 1000 });
  const answer = result.stdout.trim();
  return result.ok && answer !== "" ? answer : undefined;
}

/**
 * The prefix `npm install -g` writes under, from the global root it wrote:
 * `<prefix>/lib/node_modules` on Unix, `<prefix>\node_modules` on Windows.
 */
export function globalPrefix(modules: string, platform: NodeJS.Platform): string {
  const parent = platform === "win32" ? path.win32.dirname(modules) : path.dirname(modules);
  return platform === "win32" ? parent : path.dirname(parent);
}

function realpath(directory: string): string {
  try {
    return fs.realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}

/** One line of the report, `--check` and the move's own log the same. */
export function line(held: Held): string {
  const where = held.root === "plugins" ? "plugins" : "install";
  if (!isRange(held.range)) return `${held.name}  ${held.have}  (${where}, pinned: ${held.range})`;
  const wanted = held.want ?? "unknown";
  return `${held.name}  ${held.have} -> ${wanted}  (${where}, ${held.range})`;
}

/**
 * Moves one package to the exact version its range now points at, and
 * writes the root's manifest entry the move leaves behind.
 *
 * The install names the version, not the range: npm is free to answer a
 * range with whatever already satisfies it, which on a machine whose
 * lockfile still holds the old version is the old version — a no-op that
 * reads as success. Naming the version is the one form that moves. The
 * manifest entry is written afterwards, because an install also rewrites it
 * to the exact thing that was installed — and the root's manifest is the
 * operator's record of *why* the package is there. A third-party package
 * keeps the range the operator wrote; a first-party one is given
 * `^<release>`, so the root keeps naming the release it is on rather than a
 * caret that will never reach the next one. A global root keeps no
 * manifest, so there is nothing to write.
 *
 * A refused write is a machine changed past its manifest: the caller must
 * treat the move as `moved` — not merely `failed` — so the update's
 * rollback path puts the whole root back, package and manifest together.
 */
export interface MoveOutcome {
  ok: boolean;
  /** The package was installed, even when the outcome is not ok. */
  installed: boolean;
  command: string;
  output: string;
}

export async function move(
  runner: CommandRunner,
  root: Root | string,
  name: string,
  keep: string | undefined,
  to: string,
): Promise<MoveOutcome> {
  return installExact(runner, typeof root === "string" ? localRoot(root) : root, name, to, keep, "installed");
}

/**
 * Rolls one package back to the version that was on disk, the same way, with
 * the manifest entry it held before the update — or, given none, the one it
 * holds now.
 */
export async function restore(
  runner: CommandRunner,
  root: Root | string,
  name: string,
  to: string,
  keep?: string,
): Promise<MoveOutcome> {
  return installExact(runner, typeof root === "string" ? localRoot(root) : root, name, to, keep, "restored");
}

async function installExact(
  runner: CommandRunner,
  root: Root,
  name: string,
  to: string,
  keep: string | undefined,
  verb: "installed" | "restored",
): Promise<MoveOutcome> {
  const global = root.kind === "global";
  const before = global ? {} : manifestOf(root.dir);
  const outcome = await runWith(runner, [
    "install",
    ...(global ? ["--global"] : []),
    "--prefix",
    root.dir,
    // The plugins root takes every install with the same flags, a restore
    // too: an install without `--install-links` turns a workflow copied in
    // from a path back into a link, whose core import then does not resolve.
    ...(global ? ["--no-audit", "--no-fund"] : PLUGINS_ROOT_FLAGS),
    "--",
    `${name}@${to}`,
  ]);
  if (!outcome.ok) return { ...outcome, installed: false };
  if (global) return { ...outcome, installed: true };
  const writeProblem = writeManifestEntry(root.dir, name, keep ?? before[name]);
  if (writeProblem) {
    return {
      ...outcome,
      ok: false,
      installed: true,
      output: [outcome.output, `${verb} ${name}@${to}, but could not restore its manifest range: ${writeProblem}`]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return { ...outcome, installed: true };
}

async function runWith(
  runner: CommandRunner,
  args: readonly string[],
): Promise<Omit<MoveOutcome, "installed">> {
  const result = await runner.run(packageManager(), [...args], { timeoutMs: 10 * 60 * 1000 });
  return {
    ok: result.ok,
    command: shellCommand(packageManager(), [...args]),
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

/** Writes one manifest entry: the spec the move or the rollback leaves behind. */
function writeManifestEntry(root: string, name: string, range: string | undefined): string | undefined {
  const file = path.join(root, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    const dependencies = manifest.dependencies;
    if (typeof dependencies !== "object" || dependencies === null) {
      return "package.json has no dependencies object";
    }
    if (typeof range !== "string") return `package.json had no prior range for ${name}`;
    (dependencies as Record<string, string>)[name] = range;
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The config the machine has, rewritten into the shape what reads it expects.
 *
 * A release that stops reading a workflow's vocabulary off the top level
 * still owes the machine its tuned values: the update is the one moment an
 * operator is already accepting changes, so this is where the old blocks
 * move — under the profiles mounting the workflow that reads each, or beside
 * the plugin whose slice names them — and the file as it was is kept at
 * `config.yaml.moved`, for the person to read and for a rollback to point at.
 * A file with none of the moved keys left changes nothing, so running this
 * twice is one move.
 *
 * The edit goes through the document, not a restringify of parsed values:
 * the comments that explain each setting are most of the file's value, and
 * they are kept the way every other config writer keeps them.
 */
export interface SettingsMoved {
  ok: boolean;
  /** What moved, said the way the operator would read it. */
  said: string[];
  /** The file the original was kept at, when it moved. */
  movedTo?: string;
}

/** The first-party workflows that read each of the moved top-level keys. */
const READ_BY_WORKFLOW: ReadonlyMap<string, readonly string[]> = new Map([
  ["policy", ["@amykit/workflow-ticket-to-qa"]],
  ["qaStatusName", ["@amykit/workflow-ticket-to-qa"]],
  ["plans", ["@amykit/workflow-note-to-plan"]],
  ["errands", ["@amykit/workflow-errand"]],
  // The tracker's two did not move under a workflow at all: the profile that
  // reads them is wherever the linear plugin mounts, so the migration puts
  // them under `plugins: "@amykit/plugin-linear"` whether or not the machine
  // had named a plugins block.
  ["workingStatusName", ["@amykit/plugin-linear"]],
  ["repoByTeam", ["@amykit/plugin-linear"]],
]);

/** What `settings` under one profile gets for one moved top-level key. */
function settingsFor(key: string, value: unknown): Record<string, unknown> | undefined {
  if (key === "plans") return plansSettings(value);
  if (key === "qaStatusName") {
    return typeof value === "string" ? { qaStatusName: value } : undefined;
  }
  if (key === "policy" || key === "errands") return ceilingSettings(key, value);
  return undefined;
}

/** The plans block's repos, gate keepers and ceilings, as the planner's settings. */
function plansSettings(value: unknown): Record<string, unknown> | undefined {
  if (!isPlain(value)) return undefined;
  const block = value as { repos?: unknown; check?: unknown; policy?: unknown };
  const settings: Record<string, unknown> = {};
  if (Array.isArray(block.repos)) settings.repos = block.repos;
  if (isPlain(block.check)) settings.check = block.check;
  // The ceilings the planner reads rode under this block too, and they are
  // the workflow's policy, which today lives under `settings.policy`.
  if (isPlain(block.policy)) settings.policy = block.policy;
  return Object.keys(settings).length > 0 ? settings : undefined;
}

/** The ceilings block, or the ceilings nested under the errands block, as-is. */
function ceilingSettings(key: string, value: unknown): Record<string, unknown> | undefined {
  const policy = key === "errands" ? (isPlain(value) ? (value as { policy?: unknown }).policy : undefined) : value;
  if (!isPlain(policy)) return undefined;
  return Object.keys(policy).length > 0 ? { policy } : undefined;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateSettingsFile(home: string): SettingsMoved {
  const place = paths(home).config;
  if (!fs.existsSync(place)) return { ok: true, said: [] };
  const text = fs.readFileSync(place, "utf-8");
  const document = yaml.parseDocument(text);
  if (document.errors.length > 0) {
    return { ok: false, said: [`could not parse ${place}: ${document.errors[0]!.message}`] };
  }
  const top = document.contents;
  if (!yaml.isMap(top)) return { ok: true, said: [] };

  const said: string[] = [];
  const workflows = entryOf(top, "workflows");
  const dropped = moveRetiredKeys(document, top, workflows, said);
  const parsed = { ...DEFAULT_CONFIG, ...(document.toJS() as Record<string, unknown>) } as AmyConfig;
  const foldedByName = convergeProjectProfiles(home, workflows, said, parsed);
  foldDefaultWorkflow(top, foldedByName, said);
  const converged = foldedByName.size > 0;

  // An old EXAMPLE always named the QA status, but a hand-written ticket
  // profile can name none of the retired keys and still lean on the
  // implicit default the old loader supplied: materializing it changes the
  // file even when nothing moved from place to place, so it is answered
  // before deciding that no migration is needed at all.
  const materialized = materializeTicketStatus(document, top, said);

  if (dropped.length === 0 && !materialized && !converged) return { ok: true, said: [] };

  const movedTo = `${place}.moved`;
  // The kept file is the machine's config before its first move, a byte the
  // operator can always go back to; rewriting it now would archive a state
  // that already moved the way the file beside it now says it did.
  if (!fs.existsSync(movedTo)) fs.writeFileSync(movedTo, text, "utf-8");
  fs.writeFileSync(place, String(document), "utf-8");
  return { ok: true, said, movedTo };
}

/** One retired key's journey from the top level to the workflow that reads it.
 *
 * Every retired key is taken off the top: where something mounted reads it,
 * the move places it and says so; where nothing does, the file it would make
 * unmountable loses it and the backup keeps the operator's bytes. The walk
 * returns what it moved off, so the caller knows whether the file changed at
 * all — materializing a default the file never had is a change the move did
 * not make, and only the two kinds together decide that no update is due. */
function moveRetiredKeys(
  document: yaml.Document,
  top: yaml.YAMLMap,
  workflows: ReturnType<typeof entryOf>,
  said: string[],
): string[] {
  const dropped: string[] = [];
  for (const [key, readers] of READ_BY_WORKFLOW) {
    const entry = entryOf(top, key);
    if (entry === undefined) continue;
    const value = unwrap(entry.value);

    const moved =
      moveIntoWorkflows(workflows, key, value, readers) || moveToTrackerSlice(document, top, key, entry);

    if (!moved) {
      // An init-era block nobody mounted still names itself at the top
      // level, and a later boot refuses it by name: the move takes it out
      // of the file it would break, keeps the original beside the move, and
      // says what became of it rather than leaving a machine that cannot
      // mount after the one command built to fix the file.
      top.delete(key);
      dropped.push(key);
      said.push(`${key}: nothing mounted reads it; kept only in the backup`);
      continue;
    }
    top.delete(key);
    dropped.push(key);
    const where = key === "workingStatusName" || key === "repoByTeam"
      ? "the linear plugin's slice"
      : `the ${readers.map((one) => one.replace("@amykit/", "")).join(", ")} workflow's profile settings`;
    said.push(`${key}: moved to ${where}`);
  }
  return dropped;
}

/**
 * A machine the old EXAMPLE wrote always named its QA status, but one edited
 * by hand may not have: the ticket schema requires the status, no slice
 * supplies it any more, and a machine this update touches cannot be left
 * without a value the mount will refuse. The ticket's profile gains what
 * init would have written, said the way a move is said.
 */
function materializeTicketStatus(document: yaml.Document, top: yaml.YAMLMap, said: string[]): boolean {
  const workflowsMap = entryOf(top, "workflows");
  if (workflowsMap === undefined || !yaml.isMap(workflowsMap.value)) return false;
  let wrote = false;
  for (const item of workflowsMap.value.items) {
    const profile = item.value;
    if (!yaml.isMap(profile) || unwrap(profile.get("workflow")) !== "@amykit/workflow-ticket-to-qa") continue;
    if (entryOf(top, "qaStatusName") !== undefined) continue;
    const settingsMap = profile.get("settings");
    // A profile that already names the status was placed by the move above,
    // not left behind by init: saying so again would rewrite a file that did
    // not drift, and an update nobody sees say something twice.
    if (yaml.isMap(settingsMap) && settingsMap.has("qaStatusName")) continue;
    if (yaml.isMap(settingsMap)) {
      settingsMap.add(new yaml.Pair("qaStatusName", "In QA"));
    } else {
      profile.add(new yaml.Pair("settings", toMap({ qaStatusName: "In QA" })));
    }
    said.push("qaStatusName: set to In QA, the value init wrote, which the ticket workflow requires");
    wrote = true;
  }
  return wrote;
}

/**
 * Places one moved key's settings under every profile that declares a
 * workflow known to read it, and says whether any profile took it.
 */
function moveIntoWorkflows(
  workflows: yaml.Pair | undefined,
  key: string,
  value: unknown,
  readers: readonly string[],
): boolean {
  if (workflows === undefined || !yaml.isMap(workflows.value)) return false;

  let placed = false;
  for (const item of workflows.value.items) {
    const profile = item.value;
    if (!yaml.isMap(profile)) continue;
    const workflow = profile.get("workflow");
    if (typeof workflow !== "string" || !readers.includes(workflow)) continue;
    const settings = settingsFor(key, value);
    if (settings === undefined) continue;
    if (!placeProfileSettings(profile, settings)) continue;
    placed = true;
  }
  return placed;
}

/** Adds the moved settings to a profile's own map, as `amy add` would write them. */
function placeProfileSettings(profile: yaml.YAMLMap, settings: Record<string, unknown>): boolean {
  const settingsMap = profile.get("settings");
  if (yaml.isMap(settingsMap)) {
    for (const [name, to] of Object.entries(settings)) if (!settingsMap.has(name)) settingsMap.add(new yaml.Pair(name, to));
    return true;
  }
  profile.add(new yaml.Pair("settings", toMap(settings)));
  return true;
}

/**
 * Puts the tracker's two moved keys in the mounted tracker's slice, and when
 * the machine never named a plugins block, writes one the way `amy add`
 * would — the tracker's slice beside whatever else lands there later.
 *
 * Read fresh each time the function runs: the first of the tracker's keys
 * may have created the plugins block that the second needs.
 */
function moveToTrackerSlice(
  document: yaml.Document,
  top: yaml.YAMLMap,
  key: string,
  entry: yaml.Pair,
): boolean {
  if (key !== "workingStatusName" && key !== "repoByTeam") return false;

  const mounted = entryOf(top, "plugins");
  if (mounted !== undefined && yaml.isMap(mounted.value)) {
    const linear = mounted.value.get("@amykit/plugin-linear");
    if (yaml.isMap(linear)) {
      if (linear.get(key) === undefined) linear.add(new yaml.Pair(key, entry.value));
    } else {
      mounted.value.add(new yaml.Pair("@amykit/plugin-linear", toMap({ [key]: entry.value })));
    }
  } else {
    // Built through the document, so the nodes the parser would have made
    // are the nodes the file gets written back with. The write goes
    // through the document's own type, which the parser narrows further
    // than a node made now can satisfy.
    const block = document.createNode({ "@amykit/plugin-linear": { [key]: unwrap(entry.value) } });
    const added = new yaml.Pair(document.createNode("plugins"), block);
    top.set?.(added.key as never, added.value as never);
  }
  return true;
}

/** The top-level entry one key names, whether or not it has a value. */
function entryOf(map: yaml.YAMLMap, key: string): yaml.Pair | undefined {
  return map.items.find((item) => yaml.isPair(item) && isKey(item, key)) as yaml.Pair | undefined;
}

/** Groups the config's profiles by the project root their workflow folder names. */
function projectGroupsOf(
  home: string,
  workflows: yaml.Pair,
): Map<string, { name: string; profile: yaml.YAMLMap; spec: string }[]> {
  const groups = new Map<string, { name: string; profile: yaml.YAMLMap; spec: string }[]>();
  for (const item of (workflows.value as yaml.YAMLMap).items) {
    if (!yaml.isPair(item) || !yaml.isScalar(item.key)) continue;
    if (!yaml.isMap(item.value)) continue;
    const spec = unwrap(item.value.get("workflow"));
    const root = projectRootOf(home, spec);
    if (root === undefined) continue;
    const group = groups.get(root) ?? [];
    group.push({ name: String(item.key.value), profile: item.value, spec: String(spec) });
    groups.set(root, group);
  }
  return groups;
}

/** Folds one project's phase profiles into the single entry the walk is driven by. */
function foldOneProject(
  home: string,
  root: string,
  group: { name: string; profile: yaml.YAMLMap; spec: string }[],
  workflows: yaml.Pair,
  said: string[],
  parsed: AmyConfig,
): { readonly kept: string; readonly folded: readonly string[] } {
  const kept = group.find((one) => path.basename(one.spec) === "workflow") ?? group[0]!;
  const others = group.filter((one) => one !== kept);
  const workFolder = path.join(root, "workflow");
  for (const one of others) said.push(`${one.name}: folded into \`${kept.name}\`, the single profile the project at ${root} walks`);
  const keptWorkflow = unwrap(kept.profile.get("workflow"));
  const keepsWorkPhase = typeof keptWorkflow === "string" && path.resolve(home, keptWorkflow) === workFolder;
  if (fs.existsSync(workFolder) && !keepsWorkPhase) {
    const field = (kept.profile as yaml.YAMLMap).items.find((item) => yaml.isPair(item) && isKey(item, "workflow")) as yaml.Pair | undefined;
    if (field) field.value = new yaml.Scalar(workFolder);
    said.push(`${kept.name}: names ${workFolder} now, the project's work phase`);
  }
  for (const one of others) {
    carryProfileFields(home, root, { name: kept.name, profile: kept.profile }, one.profile, one.name, said, parsed);
    (workflows.value as yaml.YAMLMap).delete(one.name);
  }
  return { kept: kept.name, folded: others.map((one) => one.name) };
}

/**
 * Turns one project's phase profiles into the project's single profile.
 *
 * A project is one profile and one daemon now: its phases are child records
 * of the project's record, walked by the one workflow the project's folders
 * compose. A config that still names the brief, the work and the proof as
 * three entries is rewritten down to the one entry naming the work folder —
 * the entry the walk is driven by — and everything the dropped entries
 * carried is carried into it or said. Nothing is moved twice: a config
 * already carrying one entry per project changes nothing.
 */
function convergeProjectProfiles(
  home: string,
  workflows: yaml.Pair | undefined,
  said: string[],
  parsed: AmyConfig,
): Map<string, string> {
  if (workflows === undefined || !yaml.isMap(workflows.value)) return new Map();
  const foldedByName = new Map<string, string>();
  for (const [root, group] of projectGroupsOf(home, workflows)) {
    if (group.length < 2) continue;
    const folded = foldOneProject(home, root, group, workflows, said, parsed);
    for (const name of folded.folded) foldedByName.set(name, folded.kept);
  }
  return foldedByName;
}

/**
 * Where a config's top-level selector points, once one of the profiles it
 * named folded: at the single profile the project walks now. A selector left
 * on a folded name leaves every command without `--workflow` failing to
 * resolve the one profile that survived.
 */
function foldDefaultWorkflow(
  top: yaml.YAMLMap,
  foldedByName: Map<string, string>,
  said: string[],
): void {
  const defaultEntry = entryOf(top, "defaultWorkflow");
  const wanted = defaultEntry && yaml.isScalar(defaultEntry.value) ? defaultEntry.value.value : undefined;
  const kept = typeof wanted === "string" ? foldedByName.get(wanted) : undefined;
  if (kept === undefined || defaultEntry === undefined) return;
  defaultEntry.value = new yaml.Scalar(kept);
  said.push(`the default workflow \`${wanted}\` folded into \`${kept}\` and names what the project walks now`);
}

/** Carries a folded profile's agent block when the single one carried none. */
function carryAgent(
  kept: { name: string; profile: yaml.YAMLMap },
  folded: yaml.YAMLMap,
  name: string,
  said: string[],
): void {
  if (kept.profile.get("agent") !== undefined) return;
  const agent = folded.get("agent");
  if (agent === undefined) return;
  kept.profile.add(new yaml.Pair("agent", agent));
  said.push(`${name}: its agent block moved to \`${kept.name}\`, which carried none`);
}

/** A phase's work is the project's alone: flags, brief store, plugins and settings it carried move in, each said. */
function carryOwnState(
  home: string,
  root: string,
  kept: { name: string; profile: yaml.YAMLMap },
  folded: yaml.YAMLMap,
  said: string[],
  parsed: AmyConfig,
): void {
  for (const flag of ["notes", "tasks"] as const) {
    if (folded.get(flag) !== true) continue;
    const ownFlag = kept.profile.get(flag);
    // A flag the survivor never said is carried; an explicit value the
    // survivor wrote by hand is a choice, and is left standing, said.
    if (ownFlag === undefined) kept.profile.add(new yaml.Pair(flag, true));
    else if (ownFlag !== true) said.push(`\`${kept.name}\` keeps \`${flag}\` off by hand, so the folded phase's want for it is left off`);
  }
  const briefStore = folded.get("briefStore");
  if (briefStore !== undefined && kept.profile.get("briefStore") === undefined) kept.profile.add(new yaml.Pair("briefStore", briefStore));
  carryPlugins(home, root, kept, folded, said, parsed);
  carrySettings(kept, folded);
}

/** Mounts a folded phase's plugins, keeping only the ones another project does not already mount. */
function carryPlugins(
  home: string,
  root: string,
  kept: { name: string; profile: yaml.YAMLMap },
  folded: yaml.YAMLMap,
  said: string[],
  parsed: AmyConfig,
): void {
  const plugins = folded.get("plugins");
  if (!yaml.isSeq(plugins)) return;
  const foldedSpecs = plugins.items.map((item) => String(unwrap(item)));
  let mounted = kept.profile.get("plugins");
  if (!yaml.isSeq(mounted)) {
    // A survivor that says nothing about what it mounts picks what the
    // machine can serve at boot, the way the mount would have picked it —
    // a channel nobody configured does not ride along — and the folded
    // phases' plugins ride beside that set.
    const effective = parsed;
    const survivor = {
      name: kept.name,
      workflow: String(kept.profile.get("workflow") ?? ""),
      plugins: [],
      takesNotes: false,
      takesTasks: false,
      settings: {},
      ...(kept.profile.get("agent") !== undefined ? { agent: unwrap(kept.profile.get("agent")) as Profile["agent"] } : {}),
    } as Profile;
    mounted = new yaml.YAMLSeq();
    const seen = new Set<string>();
    for (const spec of [...pluginList(effective, survivor), ...foldedSpecs]) {
      if (projectRootOf(home, spec) !== undefined && path.resolve(spec) !== path.resolve(survivor.workflow)) continue;
      if (seen.has(spec)) continue;
      seen.add(spec);
      (mounted as yaml.YAMLSeq).add(new yaml.Scalar(spec));
    }
    kept.profile.set("plugins", mounted);
    said.push(`${kept.name}: keeps the mounts it was going to be recommended, and carries the folded phases' plugins beside them`);
  }
  for (const spec of foldedSpecs) {
    if (projectRootOf(home, spec) === root) continue;
    if (!(mounted as yaml.YAMLSeq).items.some((one) => unwrap(one) === spec)) (mounted as yaml.YAMLSeq).add(new yaml.Scalar(spec));
  }
}

/** Carries a folded phase's settings into the single profile's own, filling only what is unset. */
function carrySettings(
  kept: { name: string; profile: yaml.YAMLMap },
  folded: yaml.YAMLMap,
): void {
  const settings = folded.get("settings");
  if (!yaml.isMap(settings)) return;
  const own = kept.profile.get("settings");
  if (yaml.isMap(own)) {
    mergeUnsetSettings(own, settings);
  } else if (kept.profile.get("settings") === undefined) {
    kept.profile.add(new yaml.Pair("settings", settings));
  } else {
    kept.profile.set("settings", settings);
  }
}

/** Carries only leaves the survivor did not write, including within nested setting groups. */
function mergeUnsetSettings(kept: yaml.YAMLMap, folded: yaml.YAMLMap): void {
  for (const pair of folded.items) {
    const key = String(unwrap(pair.key));
    const own = kept.get(key, true);
    if (own === undefined) {
      kept.add(new yaml.Pair(pair.key, pair.value));
    } else if (yaml.isMap(own) && yaml.isMap(pair.value)) {
      mergeUnsetSettings(own, pair.value);
    }
  }
}

/** Carries one folded profile's agent, flags, brief store, plugins and settings into the single one, saying every carry. */
function carryProfileFields(
  home: string,
  root: string,
  kept: { name: string; profile: yaml.YAMLMap },
  folded: yaml.YAMLMap,
  name: string,
  said: string[],
  parsed: AmyConfig,
): void {
  // The project's one profile carries the work phase's agent when it has
  // one; a folded phase's own block is said, because the ladder it tuned is
  // not the ladder the single profile drives.
  carryAgent(kept, folded, name, said);
  carryOwnState(home, root, kept, folded, said, parsed);
}

/** Whether a spec is one of the project's own phase folders, which the walk calls and nothing mounts. */
function projectRootOf(home: string, spec: unknown): string | undefined {
  if (typeof spec !== "string") return undefined;
  const resolved = spec.startsWith(".") ? path.resolve(home, spec) : path.resolve(spec);
  if (!fs.existsSync(resolved)) return undefined;
  const folder = path.basename(resolved);
  if (!["brief", "workflow", "prove", "test"].includes(folder)) return undefined;
  return path.resolve(resolved, "..");
}

/** Whether a document item's key is this string, however it was parsed. */
function isKey(item: yaml.Pair, key: string): boolean {
  const name = item.key;
  return yaml.isScalar(name) && name.value === key;
}

/** A plain value for a YAML node, when it holds one. */
function unwrap(node: unknown): unknown {
  if (yaml.isScalar(node)) return node.value;
  if (yaml.isMap(node) || yaml.isSeq(node)) return node.toJSON();
  return node;
}

function toMap(value: Record<string, unknown>): yaml.YAMLMap {
  const map = new yaml.YAMLMap();
  for (const [key, item] of Object.entries(value)) map.add(new yaml.Pair(key, item));
  return map;
}