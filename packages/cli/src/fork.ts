import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandRunner } from "@amykit/core";
import { PLUGINS_ROOT_FLAGS, packageManager, shellCommand } from "./install.js";
import { profileForks, profileRoot } from "./paths.js";
import { compareVersions } from "./update.js";
import { Profile } from "./profiles.js";
import { fileURLToPath } from "node:url";
import { localWorkflow } from "./workflow.js";

/**
 * A fork is a package's source, taken from its repository at the tag its
 * version was released under, kept under the package's own name, and
 * resolved for one profile instead of the published copy.
 *
 * Design: docs/design/a-plugin-is-installed-into-a-workflow.md.
 */

/** The file a fork records its base in, beside the source it was taken from. */
export const FORK_RECORD = ".amy-fork.json";

/** What a fork was taken from: enough to fetch the same source again. */
interface ForkBase {
  readonly package: string;
  readonly version: string;
  readonly commit: string;
  readonly url: string;
  /** The package's directory inside the repository; empty for its root. */
  readonly directory: string;
  /** The tag or ref the source was fetched at. */
  readonly ref: string;
}

export interface ForkRecord {
  readonly base: ForkBase;
  /** The source digest the last successful build was taken from. */
  readonly built?: string;
}

/** Where one package's source lives: a directory of a repository at a ref. */
export interface SourceAt {
  readonly url: string;
  readonly directory: string;
  readonly ref: string;
}

/** The two packages a profile root never holds: both resolve from amy's own install. */
export const NEVER_FORKED = ["@amykit/core", "@amykit/cli"] as const;

/** What never belongs to a fork's source: what npm or a build writes, and amy's record. */
const NOT_SOURCE = new Set(["node_modules", "dist", ".git", FORK_RECORD]);

interface Manifest {
  name?: string;
  version?: string;
  repository?: string | { type?: string; url?: string; directory?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readManifest(directory: string): Manifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as Manifest;
  } catch {
    return undefined;
  }
}

/**
 * The repository URL git can fetch, from the forms a `repository` field takes:
 * npm's `git+` prefix, the `github:` shorthand and a bare `owner/repo`.
 */
function gitUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("github:")) return `https://github.com/${trimmed.slice("github:".length)}.git`;
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return `https://github.com/${trimmed}.git`;
  return trimmed.replace(/^git\+/, "");
}

/**
 * Where a released version's source is, read off its manifest (S12): the
 * repository's URL and directory, at the tag `<name>@<version>` every release
 * is cut under. A package that declares no repository has no source to fork,
 * and that is refused naming the field and what was asked.
 */
export function sourceOfManifest(manifest: Manifest, asked: string): SourceAt {
  const name = manifest.name ?? asked;
  const repository = manifest.repository;
  const url = typeof repository === "string" ? repository : repository?.url;
  if (!url) {
    throw new Error(`${name}@${manifest.version ?? "?"} declares no \`repository\` in its package.json, so there is no source to fork it from (asked: ${asked})`);
  }
  if (!manifest.version) throw new Error(`${name} declares no \`version\`, so there is no tag to fork it at (asked: ${asked})`);
  const directory = typeof repository === "object" ? (repository.directory ?? "") : "";
  return { url: gitUrl(url), directory: trimSlashes(directory), ref: `${name}@${manifest.version}` };
}

/**
 * A git URL that names a directory of its repository: `<url>#path:<dir>`, or
 * `<url>#<ref>&path:<dir>` for a ref other than the default branch. The form
 * pnpm reads for a package inside a repository, so it is not a new word.
 */
export function gitDirectory(spec: string): SourceAt | undefined {
  const hash = spec.indexOf("#");
  if (hash < 0) return undefined;
  let ref = "";
  let directory: string | undefined;
  for (const part of spec.slice(hash + 1).split("&")) {
    if (part.startsWith("path:")) directory = trimSlashes(part.slice("path:".length));
    else if (part) ref = part;
  }
  return directory === undefined ? undefined : { url: gitUrl(spec.slice(0, hash)), directory, ref };
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** One fetched source, in a scratch directory the caller disposes of. */
export interface Fetched {
  /** The package's directory inside the fetched tree. */
  readonly directory: string;
  /** The repository's root, for what the package extends from outside itself. */
  readonly root: string;
  readonly commit: string;
  dispose(): void;
}

/**
 * Fetches one directory of a repository at a ref, into a scratch directory,
 * and refuses before anything is written when the repository cannot be
 * reached, the tag is not there, or the directory is not a package.
 */
export async function fetchSource(runner: CommandRunner, at: SourceAt, asked: string): Promise<Fetched> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-"));
  const dispose = () => fs.rmSync(scratch, { recursive: true, force: true });
  try {
    if (at.ref && !/^[0-9a-f]{40}$/.test(at.ref)) {
      const listed = await runner.run("git", ["ls-remote", at.url, `refs/tags/${at.ref}`, `refs/heads/${at.ref}`]);
      if (!listed.ok) throw new Error(`could not reach ${at.url} to fetch ${at.ref} (asked: ${asked}): ${(listed.stderr || listed.stdout).trim()}`);
      if (listed.stdout.trim() === "") throw new Error(`the tag ${at.ref} does not exist at ${at.url} (asked: ${asked})`);
    }
    const git = async (args: readonly string[], what: string) => {
      const ran = await runner.run("git", args, { cwd: scratch, timeoutMs: 10 * 60 * 1000 });
      if (!ran.ok) throw new Error(`${what} ${at.url}${at.ref ? ` at ${at.ref}` : ""} failed (asked: ${asked}): ${(ran.stderr || ran.stdout).trim()}`);
      return ran.stdout.trim();
    };
    await git(["init", "-q"], "preparing to fetch");
    await git(["fetch", "-q", "--depth", "1", at.url, at.ref || "HEAD"], "fetching");
    await git(["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], "checking out");
    const commit = await git(["rev-parse", "HEAD"], "reading the commit of");
    const directory = path.join(scratch, at.directory);
    if (!fs.existsSync(path.join(directory, "package.json"))) {
      throw new Error(`${at.directory || "the root"} of ${at.url} at ${at.ref || "HEAD"} is not a package: it has no package.json (asked: ${asked})`);
    }
    return { directory, root: scratch, commit, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** A tree of files by relative path, the way a fork's source is compared and merged. */
export type Tree = Map<string, Buffer>;

/** Reads a directory's source, leaving out what npm or a build wrote and amy's own record. */
export function readTree(directory: string): Tree {
  const tree: Tree = new Map();
  const walk = (at: string) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (NOT_SOURCE.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue;
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) tree.set(path.relative(directory, full).split(path.sep).join("/"), fs.readFileSync(full));
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  return tree;
}

/** One digest for a tree: what changes when a person saves a file in a fork. */
export function treeDigest(tree: Tree): string {
  const hash = createHash("sha256");
  for (const file of [...tree.keys()].sort()) {
    hash.update(file).update("\0").update(tree.get(file)!).update("\0");
  }
  return hash.digest("hex");
}

/** Writes a tree into a directory, removing the source files it no longer has. */
export function writeTree(directory: string, tree: Tree): void {
  for (const file of readTree(directory).keys()) {
    if (!tree.has(file)) fs.rmSync(path.join(directory, file), { force: true });
  }
  for (const [file, content] of tree) {
    const to = path.join(directory, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (!fs.existsSync(to) || !fs.readFileSync(to).equals(content)) fs.writeFileSync(to, content);
  }
}

export function readRecord(fork: string): ForkRecord | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(fork, FORK_RECORD), "utf-8")) as ForkRecord;
  } catch {
    return undefined;
  }
}

export function writeRecord(fork: string, record: ForkRecord): void {
  fs.writeFileSync(path.join(fork, FORK_RECORD), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

/**
 * Where a fork goes when nothing names a place (S14): inside the project of a
 * workflow of your own, outside what it publishes, and under the profile in
 * AMY_HOME for a workflow somebody else published. A configured `forks`
 * directory or `--to` replaces the default place; neither is a path code reads.
 */
export function forkPlace(home: string, profile: Profile, name: string, options: { to?: string; forks?: string } = {}): string {
  const unscoped = name.split("/").at(-1)!;
  if (options.to) return path.join(path.resolve(options.to), unscoped);
  if (options.forks) return path.join(path.resolve(home, options.forks), profile.name, unscoped);
  const own = ownedDirectory(home, profile);
  return own ? path.join(own, "forks", unscoped) : path.join(profileForks(home, profile.name), unscoped);
}

/** The project a workflow of your own lives in, or nothing for a published one. */
function ownedDirectory(home: string, profile: Profile): string | undefined {
  if (profile.project) return profile.project.root;
  const local = localWorkflow(home, profile.workflow);
  if (local) return path.dirname(fileURLToPath(local));
  const spec = profile.workflow;
  if (!path.isAbsolute(spec) && !spec.startsWith("./") && !spec.startsWith("../")) return undefined;
  const resolved = path.resolve(spec);
  if (!fs.existsSync(resolved)) return undefined;
  return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
}

/**
 * Makes a source taken out of a monorepo build on its own: a `tsconfig.json`
 * that extends a file outside the package is flattened, its project
 * references dropped, and a package with no build script is given one. These
 * are a fork's first edits, made after the base is recorded, so an update
 * keeps them the way it keeps anything else a person changed.
 */
function standalone(fork: string, repositoryRoot: string, source: string): void {
  const tsconfig = path.join(fork, "tsconfig.json");
  if (!fs.existsSync(tsconfig)) return;
  const flattened = flattenTsconfig(path.join(source, "tsconfig.json"), repositoryRoot);
  delete flattened.references;
  const options = (flattened.compilerOptions ?? {}) as Record<string, unknown>;
  delete options.composite;
  flattened.compilerOptions = options;
  fs.writeFileSync(tsconfig, `${JSON.stringify(flattened, null, 2)}\n`, "utf-8");

  const manifest = readManifest(fork) ?? {};
  if (manifest.scripts?.build) return;
  const typescript = readManifest(repositoryRoot)?.devDependencies?.typescript ?? "^5";
  manifest.scripts = { ...manifest.scripts, build: "tsc -p tsconfig.json" };
  manifest.devDependencies = { ...manifest.devDependencies, typescript: manifest.devDependencies?.typescript ?? typescript };
  fs.writeFileSync(path.join(fork, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/** A tsconfig with every relative `extends` inside the repository folded in. */
function flattenTsconfig(file: string, repositoryRoot: string): Record<string, unknown> {
  const own = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  const extended = typeof own.extends === "string" && own.extends.startsWith(".") ? path.resolve(path.dirname(file), own.extends) : undefined;
  if (!extended || path.relative(repositoryRoot, extended).startsWith("..") || !fs.existsSync(extended)) return own;
  const parent = flattenTsconfig(extended, repositoryRoot);
  const merged: Record<string, unknown> = { ...parent, ...own };
  delete merged.extends;
  merged.compilerOptions = { ...(parent.compilerOptions as object | undefined), ...(own.compilerOptions as object | undefined) };
  return merged;
}

/** Copies a fetched package's source into the place a fork lives. */
function copySource(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  writeTree(to, readTree(from));
}

export interface Forked {
  readonly name: string;
  readonly directory: string;
  readonly record: ForkRecord;
}

/**
 * Takes a fork: fetches the source, refuses a place that already holds
 * something, copies it there with its base recorded, and makes it build on
 * its own. Nothing is written until the fetch has succeeded.
 */
export async function takeFork(
  runner: CommandRunner,
  at: SourceAt,
  asked: string,
  place: (name: string) => string,
): Promise<Forked> {
  const fetched = await fetchSource(runner, at, asked);
  try {
    const manifest = readManifest(fetched.directory) ?? {};
    const name = manifest.name;
    if (!name) throw new Error(`${at.url}${at.directory ? `#path:${at.directory}` : ""} holds a package.json with no name (asked: ${asked})`);
    if ((NEVER_FORKED as readonly string[]).includes(name)) {
      throw new Error(`${name} is not forked: it resolves from amy's own install in every profile`);
    }
    const directory = place(name);
    if (fs.existsSync(directory)) throw new Error(`${directory} already exists; a fork is taken into an empty place`);
    copySource(fetched.directory, directory);
    const record: ForkRecord = {
      base: { package: name, version: manifest.version ?? "", commit: fetched.commit, url: at.url, directory: at.directory, ref: at.ref },
    };
    writeRecord(directory, record);
    standalone(directory, fetched.root, fetched.directory);
    return { name, directory, record };
  } finally {
    fetched.dispose();
  }
}

/** The manifest amy writes at a profile root: what it depends on, and which names it overrides. */
export interface RootManifest {
  name: string;
  private: true;
  dependencies: Record<string, string>;
  overrides: Record<string, string>;
}

/**
 * The forks a profile resolves, by package name: the names its root
 * overrides, each mapped to the directory its `file:` dependency names.
 */
export function profileForkDirectories(home: string, profile: string): Map<string, string> {
  const manifest = readRootManifest(home, profile);
  const forks = new Map<string, string>();
  if (!manifest) return forks;
  const root = profileRoot(home, profile);
  for (const name of Object.keys(manifest.overrides ?? {})) {
    const spec = manifest.dependencies?.[name];
    if (spec?.startsWith("file:")) forks.set(name, path.resolve(root, spec.slice("file:".length)));
  }
  return forks;
}

export function readRootManifest(home: string, profile: string): RootManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(profileRoot(home, profile), "package.json"), "utf-8")) as RootManifest;
  } catch {
    return undefined;
  }
}

/** Whether a profile root holds this name as one of its own, ahead of the machine's. */
export function heldByProfile(home: string, profile: string, name: string): boolean {
  return Object.hasOwn(readRootManifest(home, profile)?.dependencies ?? {}, name);
}

/**
 * The packages of a profile that must sit in its root for an import of a
 * forked name to reach the fork: every one installed in the machine's root
 * that depends on a forked name, directly or through another installed one.
 */
function dependentsOf(pluginsRoot: string, specs: readonly string[], forked: ReadonlySet<string>): string[] {
  const reaching = new Map<string, boolean>();
  const reaches = (name: string, seen: Set<string>): boolean => {
    if (forked.has(name)) return true;
    const known = reaching.get(name);
    if (known !== undefined) return known;
    if (seen.has(name)) return false;
    seen.add(name);
    const manifest = readManifest(path.join(pluginsRoot, "node_modules", ...name.split("/")));
    const names = Object.keys({ ...manifest?.dependencies, ...manifest?.peerDependencies });
    const answer = names.some((dependency) => reaches(dependency, seen));
    reaching.set(name, answer);
    return answer;
  };
  return specs.filter((spec) => !forked.has(spec) && readManifest(path.join(pluginsRoot, "node_modules", ...spec.split("/"))) !== undefined && reaches(spec, new Set()));
}

export interface RootOutcome {
  readonly ok: boolean;
  readonly command: string;
  readonly output: string;
}

/**
 * Writes a profile's root and installs it (S11): each fork under
 * `dependencies` as a `file:` spec and `$`-referred to under `overrides`, so
 * a package that imports the name reaches the fork too; each package of the
 * profile that imports a forked name installed beside it. Then the core and
 * the cli are taken out (S19), so what the root holds resolves them from the
 * machine's root it sits inside. No fork left removes the root.
 */
export async function installProfileRoot(
  runner: CommandRunner,
  home: string,
  pluginsRoot: string,
  profile: string,
  forks: ReadonlyMap<string, string>,
  specs: readonly string[],
): Promise<RootOutcome> {
  const root = profileRoot(home, profile);
  if (forks.size === 0) {
    fs.rmSync(root, { recursive: true, force: true });
    return { ok: true, command: "", output: "" };
  }
  const dependencies: Record<string, string> = {};
  const overrides: Record<string, string> = {};
  for (const [name, directory] of [...forks].sort(([a], [b]) => a.localeCompare(b))) {
    dependencies[name] = `file:${directory}`;
    overrides[name] = `$${name}`;
  }
  for (const dependent of dependentsOf(pluginsRoot, specs, new Set(forks.keys())).sort()) {
    dependencies[dependent] = `file:${path.join(pluginsRoot, "node_modules", ...dependent.split("/"))}`;
  }
  const manifest: RootManifest = { name: `amy-profile-${profile}`, private: true, dependencies, overrides };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  // A `file:` package installed as a copy is not copied again while one is
  // there; the copy of a fork is always taken fresh.
  for (const name of Object.keys(dependencies)) fs.rmSync(path.join(root, "node_modules", ...name.split("/")), { recursive: true, force: true });

  const args = ["install", "--prefix", root, ...PLUGINS_ROOT_FLAGS];
  const command = shellCommand(packageManager(), args);
  const ran = await runner.run(packageManager(), args, { timeoutMs: 10 * 60 * 1000 });
  const output = [ran.stdout, ran.stderr].filter(Boolean).join("\n").trim();
  if (!ran.ok) return { ok: false, command, output };
  pruneHostPackages(path.join(root, "node_modules"));
  return { ok: true, command, output };
}

/** Removes every copy of the core and the cli a profile root's install put down, however deep. */
function pruneHostPackages(modules: string): void {
  if (!fs.existsSync(modules)) return;
  for (const name of NEVER_FORKED) fs.rmSync(path.join(modules, ...name.split("/")), { recursive: true, force: true });
  for (const entry of fs.readdirSync(modules)) {
    const inner = path.join(modules, entry);
    const packages = entry.startsWith("@") ? fs.readdirSync(inner).map((name) => path.join(inner, name)) : [inner];
    for (const directory of packages) {
      const nested = path.join(directory, "node_modules");
      if (fs.existsSync(nested)) pruneHostPackages(nested);
    }
  }
}

export interface Built {
  readonly ok: boolean;
  /** Whether a build ran at all: an unchanged source is not built again. */
  readonly ran: boolean;
  readonly output: string;
}

/**
 * Builds a fork with its own build script when its source digest moved since
 * the last build (S17), and records the digest it built. A fork with no build
 * script is its own output.
 */
export async function buildFork(runner: CommandRunner, fork: string): Promise<Built> {
  const record = readRecord(fork);
  const digest = treeDigest(readTree(fork));
  if (record?.built === digest) return { ok: true, ran: false, output: "" };
  const manifest = readManifest(fork);
  if (manifest?.scripts?.build) {
    const run = async (args: readonly string[]) => runner.run(packageManager(), args, { cwd: fork, timeoutMs: 10 * 60 * 1000 });
    if (!fs.existsSync(path.join(fork, "node_modules"))) {
      const installed = await run(["install", "--no-audit", "--no-fund"]);
      if (!installed.ok) return { ok: false, ran: true, output: [installed.stdout, installed.stderr].filter(Boolean).join("\n").trim() };
    }
    const built = await run(["run", "build"]);
    if (!built.ok) return { ok: false, ran: true, output: [built.stdout, built.stderr].filter(Boolean).join("\n").trim() };
  }
  // Read after the build, not before it: a build that writes beside its
  // source would otherwise look like an edit, and build again every boot.
  if (record) writeRecord(fork, { ...record, built: treeDigest(readTree(fork)) });
  return { ok: true, ran: true, output: "" };
}

/**
 * Builds every fork of a profile whose source moved, and refreshes the copies
 * the profile root resolves when one did. A failing build is the boot's
 * refusal, naming the fork and what its build said.
 */
export async function prepareForks(
  runner: CommandRunner,
  home: string,
  pluginsRoot: string,
  profile: string,
  specs: readonly string[],
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const forks = profileForkDirectories(home, profile);
  let rebuilt = false;
  for (const [name, fork] of forks) {
    if (!fs.existsSync(fork)) return { ok: false, problems: [`${name}: the fork at ${fork} is gone; \`amy remove ${name}\` drops it from the profile`] };
    const built = await buildFork(runner, fork);
    if (!built.ok) return { ok: false, problems: [`${name}: the fork at ${fork} does not build:\n${built.output || "its build said nothing"}`] };
    rebuilt ||= built.ran;
  }
  if (!rebuilt) return { ok: true };
  const installed = await installProfileRoot(runner, home, pluginsRoot, profile, forks, specs);
  return installed.ok ? { ok: true } : { ok: false, problems: [`${installed.command} failed:\n${installed.output || "it said nothing"}`] };
}

/** The labels a marked merge names its three sides by. */
export interface MergeLabels {
  readonly ours: string;
  readonly base: string;
  readonly theirs: string;
}

/**
 * A three-way merge of one text file, line by line (S15): a change on one
 * side is taken, the same change on both is taken once, and two different
 * changes to the same lines are a conflict, written with the markers
 * `git merge-file --diff3` writes.
 */
export function mergeText(base: string, ours: string, theirs: string, labels: MergeLabels): { text: string; conflicted: boolean } {
  if (ours === theirs || theirs === base) return { text: ours, conflicted: false };
  if (ours === base) return { text: theirs, conflicted: false };
  return mergeLines(base.split("\n"), ours.split("\n"), theirs.split("\n"), labels);
}

/** The walk behind `mergeText`: stable lines both sides kept, and the chunks between them. */
function mergeLines(b: readonly string[], o: readonly string[], t: readonly string[], labels: MergeLabels): { text: string; conflicted: boolean } {
  const toOurs = matches(b, o);
  const toTheirs = matches(b, t);
  const out: string[] = [];
  let conflicted = false;
  let [i, j, k] = [0, 0, 0];
  while (i < b.length || j < o.length || k < t.length) {
    if (i < b.length && toOurs[i] === j && toTheirs[i] === k) {
      out.push(b[i]!);
      [i, j, k] = [i + 1, j + 1, k + 1];
      continue;
    }
    const stable = nextStable(i, b.length, toOurs, toTheirs);
    const oursEnd = stable < b.length ? toOurs[stable]! : o.length;
    const theirsEnd = stable < b.length ? toTheirs[stable]! : t.length;
    const chunk = resolveChunk(b.slice(i, stable), o.slice(j, oursEnd), t.slice(k, theirsEnd), labels);
    out.push(...chunk.lines);
    conflicted ||= chunk.conflicted;
    [i, j, k] = [stable, oursEnd, theirsEnd];
  }
  return { text: out.join("\n"), conflicted };
}

/** The next line of the base both sides kept, from `from` on. */
function nextStable(from: number, length: number, toOurs: Int32Array, toTheirs: Int32Array): number {
  let at = from;
  while (at < length && (toOurs[at] === -1 || toTheirs[at] === -1)) at += 1;
  return at;
}

/** One unstable chunk: one side's change is taken, the same change once, and two changes are a conflict. */
function resolveChunk(was: string[], mine: string[], upstream: string[], labels: MergeLabels): { lines: string[]; conflicted: boolean } {
  if (same(mine, was)) return { lines: upstream, conflicted: false };
  if (same(upstream, was) || same(mine, upstream)) return { lines: mine, conflicted: false };
  return {
    lines: [`<<<<<<< ${labels.ours}`, ...mine, `||||||| ${labels.base}`, ...was, "=======", ...upstream, `>>>>>>> ${labels.theirs}`],
    conflicted: true,
  };
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

/** Past this many cells the table is not built, and the whole middle counts as changed. */
const LARGEST_TABLE = 25_000_000;

/**
 * For each line of `a`, the line of `b` it is matched to in a longest common
 * subsequence, or -1. The common head and tail are matched first, so the
 * table only spans what actually differs.
 */
function matches(a: readonly string[], b: readonly string[]): Int32Array {
  const matched = new Int32Array(a.length).fill(-1);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    matched[start] = start;
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
    matched[endA] = endB;
  }
  matchMiddle(a.slice(start, endA), b.slice(start, endB), start, matched);
  return matched;
}

/** Matches what differs between the common head and tail, through a table of common lengths. */
function matchMiddle(a: readonly string[], b: readonly string[], offset: number, matched: Int32Array): void {
  const width = b.length + 1;
  if (a.length === 0 || b.length === 0 || (a.length + 1) * width > LARGEST_TABLE) return;
  const table = new Uint32Array((a.length + 1) * width);
  for (let r = a.length - 1; r >= 0; r -= 1) {
    for (let c = b.length - 1; c >= 0; c -= 1) {
      table[r * width + c] = a[r] === b[c] ? table[(r + 1) * width + c + 1]! + 1 : Math.max(table[(r + 1) * width + c]!, table[r * width + c + 1]!);
    }
  }
  let [r, c] = [0, 0];
  while (r < a.length && c < b.length) {
    if (a[r] === b[c]) {
      matched[offset + r] = offset + c;
      [r, c] = [r + 1, c + 1];
    } else if (table[(r + 1) * width + c]! >= table[r * width + c + 1]!) r += 1;
    else c += 1;
  }
}

function equal(a: Buffer | undefined, b: Buffer | undefined): boolean {
  return a === undefined ? b === undefined : b !== undefined && a.equals(b);
}

function isText(content: Buffer): boolean {
  return !content.includes(0);
}

interface MergedTree {
  readonly tree: Tree;
  /** The files two sides changed differently; their merged text carries the markers. */
  readonly conflicts: string[];
}

/**
 * Merges a fork's tree with a new upstream tree over the base both came
 * from, file by file. A file only one side changed (or added, or deleted)
 * is that side's; one both changed is merged by line when all three are text,
 * and is a conflict otherwise.
 */
function mergeTrees(base: Tree, fork: Tree, upstream: Tree, labels: MergeLabels): MergedTree {
  const tree: Tree = new Map();
  const conflicts: string[] = [];
  const files = [...new Set([...base.keys(), ...fork.keys(), ...upstream.keys()])].sort();
  for (const file of files) {
    const merged = mergeFile(base.get(file), fork.get(file), upstream.get(file), labels);
    if (merged.content) tree.set(file, merged.content);
    if (merged.conflicted) conflicts.push(file);
  }
  return { tree, conflicts };
}

/** One file of the merge: its content afterwards (none when it is deleted), and whether it conflicted. */
function mergeFile(was: Buffer | undefined, mine: Buffer | undefined, theirs: Buffer | undefined, labels: MergeLabels): { content?: Buffer; conflicted: boolean } {
  if (equal(mine, theirs) || equal(theirs, was)) return { content: mine, conflicted: false };
  if (equal(mine, was)) return { content: theirs, conflicted: false };
  if (was && mine && theirs && [was, mine, theirs].every(isText)) {
    const merged = mergeText(was.toString("utf-8"), mine.toString("utf-8"), theirs.toString("utf-8"), labels);
    return { content: Buffer.from(merged.text, "utf-8"), conflicted: merged.conflicted };
  }
  return { content: mine ?? theirs, conflicted: true };
}

/** One fork's update, computed before anything on disk moves. */
export interface ForkUpdate {
  readonly name: string;
  readonly fork: string;
  readonly from: string;
  readonly to: string;
  readonly merged: MergedTree;
  readonly record: ForkRecord;
}

export interface ForkTarget {
  readonly name: string;
  readonly fork: string;
  readonly version: string;
}

/**
 * Merges each fork with the version it moves to (S15): the base it was taken
 * from and the new version are fetched by their tags, and the fork is merged
 * over them. Nothing is written here: a conflict anywhere is returned with
 * every other merge, so the caller stops the whole update untouched.
 */
export async function mergeForks(runner: CommandRunner, targets: readonly ForkTarget[]): Promise<ForkUpdate[]> {
  const updates: ForkUpdate[] = [];
  for (const target of targets) {
    const record = readRecord(target.fork);
    if (!record || !record.base.version || record.base.version === target.version) continue;
    const base = record.base;
    const nextRef = `${base.package}@${target.version}`;
    const before = await fetchSource(runner, { url: base.url, directory: base.directory, ref: base.ref || base.commit }, base.package);
    try {
      const after = await fetchSource(runner, { url: base.url, directory: base.directory, ref: nextRef }, nextRef);
      try {
        const merged = mergeTrees(readTree(before.directory), readTree(target.fork), readTree(after.directory), {
          ours: `fork ${target.fork}`,
          base: `${base.package}@${base.version}`,
          theirs: nextRef,
        });
        updates.push({
          name: target.name,
          fork: target.fork,
          from: base.version,
          to: target.version,
          merged,
          record: { base: { ...base, version: target.version, commit: after.commit, ref: nextRef } },
        });
      } finally {
        after.dispose();
      }
    } finally {
      before.dispose();
    }
  }
  return updates;
}

/** Where the marked merge of a fork that conflicted is written: beside it, never in it. */
export function markedMergePlace(fork: string): string {
  return `${fork}.merge`;
}

/**
 * Writes the marked merge of every conflicting fork beside it, and nothing
 * else: the fork stays byte for byte as it was. Returns what to tell the person.
 */
export function writeMarkedMerges(updates: readonly ForkUpdate[]): string[] {
  const said: string[] = [];
  for (const update of updates) {
    if (update.merged.conflicts.length === 0) continue;
    const place = markedMergePlace(update.fork);
    fs.rmSync(place, { recursive: true, force: true });
    fs.mkdirSync(place, { recursive: true });
    writeTree(place, update.merged.tree);
    said.push(`${update.name} ${update.from} → ${update.to}: your fork and the new version changed the same lines in ${update.merged.conflicts.join(", ")}; the marked merge is at ${place}`);
  }
  return said;
}

/** Applies merges that had no conflict: the fork takes the merged tree and its new base. */
export function applyForkUpdates(updates: readonly ForkUpdate[]): void {
  for (const update of updates) {
    writeTree(update.fork, update.merged.tree);
    writeRecord(update.fork, update.record);
    fs.rmSync(markedMergePlace(update.fork), { recursive: true, force: true });
  }
}


/**
 * The forks an update would move, across every profile: each one whose base
 * is behind the version the machine now names for its package.
 */
export function forkTargets(home: string, profiles: readonly string[], versionOf: (name: string) => string | undefined): ForkTarget[] {
  const targets: ForkTarget[] = [];
  for (const profile of profiles) {
    for (const [name, fork] of profileForkDirectories(home, profile)) {
      const version = versionOf(name);
      const base = readRecord(fork)?.base.version;
      if (version && base && compareVersions(version, base) > 0) targets.push({ name, fork, version });
    }
  }
  return targets;
}
