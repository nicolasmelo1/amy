import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRunner } from "@amykit/core";
import { packageManager, shellCommand } from "./install.js";

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
  const fromInstall = local === undefined ? "latest" : updateRangeOf(local, CLI, manifestOf(local)[CLI] ?? "latest");
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

/** Release versions by their numbers; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return Number(!a.includes("-")) - Number(!b.includes("-"));
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
  return { plugins, install: { kind: "global", dir: globalPrefix(modules, platform), modules } };
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
    "--no-audit",
    "--no-fund",
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
