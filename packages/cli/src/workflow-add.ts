import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRunner, DIAGRAM_FILE } from "@amykit/core";
import { packageEntrySpecifier } from "./spec.js";
import { workflowsDirectory } from "./workflow.js";

interface Manifest {
  name?: string;
  main?: unknown;
  exports?: unknown;
  dependencies?: Record<string, string>;
}

/** Where a copied callee comes from: its root, its entry, and what it says it depends on. */
interface Source {
  readonly root: string;
  readonly entry: string;
  readonly manifest: Manifest;
}

/** One file to copy, and the relative specifiers in it that have to be rewritten to the file they reached. */
interface Copied {
  readonly file: string;
  readonly rewrites: ReadonlyMap<string, string>;
}

export interface AddInto {
  readonly runner: CommandRunner;
  /** Where a package specifier is resolved from: the plugins amy installed. */
  readonly pluginsRoot?: string;
}

export interface AddedInto {
  /** The directory the copy is in. */
  readonly directory: string;
  /** The copied entry, which is what the caller imports. */
  readonly entry: string;
}

/**
 * Copies a workflow into another one's directory, so the caller owns it: its
 * diagram, its entry and every file the entry imports by a relative path,
 * and its manifest — and the same for any workflow it imports in turn. What
 * it depends on is added to the caller's manifest and installed, and a
 * dependency that cannot be resolved, or that the caller already holds at a
 * version the copy cannot use, refuses the copy before anything is written.
 *
 * Nothing updates the copy afterwards. That is the point of it — the way
 * shadcn/ui hands out a component: the source becomes the caller's to read
 * and change — and it is called the same way the package would be.
 */
export async function addWorkflowInto(home: string, spec: string, into: string, options: AddInto): Promise<AddedInto> {
  const caller = path.join(workflowsDirectory(home), into);
  const callerManifest = path.join(caller, "package.json");
  if (!fs.existsSync(callerManifest)) {
    throw new Error(`there is no workflow of your own called \`${into}\` under ${workflowsDirectory(home)}; write one with \`amy workflow new ${into}\``);
  }
  const source = sourceOf(spec, options.pluginsRoot ?? path.join(home, "plugins"));
  const name = copyName(source);
  const target = path.join(caller, "workflows", name);
  if (fs.existsSync(target)) throw new Error(`${target} already exists; it is yours to edit there, or remove it first`);

  const files = filesOf(source);
  const owned = JSON.parse(fs.readFileSync(callerManifest, "utf-8")) as Manifest;
  const needed = await dependenciesToInstall(source, files, owned, caller, options.runner, spec);

  for (const { file, rewrites } of files) {
    const to = path.join(target, path.relative(source.root, file));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (rewrites.size === 0) {
      fs.copyFileSync(file, to);
      continue;
    }
    let text = fs.readFileSync(file, "utf-8");
    for (const [written, reached] of rewrites) text = text.split(`"${written}"`).join(`"${reached}"`).split(`'${written}'`).join(`'${reached}'`);
    fs.writeFileSync(to, text, "utf-8");
  }
  const entry = path.join(target, path.relative(source.root, source.entry));
  if (needed.length === 0) return { directory: target, entry };
  const installed = await options.runner.run("npm", ["install", "--no-audit", "--no-fund", ...needed], { cwd: caller });
  if (!installed.ok) {
    throw new Error(`copied ${name} into ${target}, and installing what it depends on failed: ${installed.stderr || installed.stdout}`);
  }
  return { directory: target, entry };
}

/** A path to a directory or an entry, or a package installed where amy keeps its plugins. */
function sourceOf(spec: string, pluginsRoot: string): Source {
  const local = path.resolve(spec);
  if (fs.existsSync(local)) {
    const directory = fs.statSync(local).isDirectory();
    const root = directory ? local : packageRootOf(path.dirname(local)) ?? path.dirname(local);
    const manifest = manifestAt(root);
    return { root, entry: directory ? entryOf(root, manifest) : local, manifest };
  }
  // Read off the directory rather than resolved through the package: a
  // package whose `exports` names only `.` refuses `pkg/package.json`.
  const root = path.join(pluginsRoot, "node_modules", ...spec.split("/"));
  if (!fs.existsSync(path.join(root, "package.json"))) {
    throw new Error(`${spec} is neither a path nor a package installed under ${pluginsRoot}; \`amy add ${spec}\` installs it first`);
  }
  const manifest = manifestAt(root);
  return { root, entry: entryOf(root, manifest), manifest };
}

function manifestAt(root: string): Manifest {
  const file = path.join(root, "package.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as Manifest) : {};
}

function packageRootOf(from: string): string | undefined {
  for (let directory = from; ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, "package.json"))) return directory;
    if (path.dirname(directory) === directory) return undefined;
  }
}

/**
 * The file a workflow is entered by: what its manifest declares, read the way
 * Node reads it, or the index beside it when it declares nothing.
 */
function entryOf(root: string, manifest: Manifest): string {
  if (manifest.exports !== undefined || manifest.main !== undefined) {
    const declared = fileURLToPath(packageEntrySpecifier(root));
    if (!fs.existsSync(declared)) throw new Error(`${root} declares ${path.relative(root, declared)} as its entry, which is not there`);
    return declared;
  }
  const entry = ["index.ts", "index.js"].map((file) => path.join(root, file)).find((file) => fs.existsSync(file));
  if (!entry) throw new Error(`${root} has no entry: no \`exports\`, \`main\`, index.ts or index.js`);
  return entry;
}

/** The directory a copy goes into: the package's unscoped name without its `workflow-` prefix. */
function copyName(source: Source): string {
  const named = source.manifest.name?.split("/").at(-1) ?? path.basename(source.root);
  return named.replace(/^workflow-/, "");
}

/**
 * Every file the copy needs: the entry with every file it reaches by a
 * relative import, however deep, and for each directory those files sit in,
 * the diagram and manifest it holds — so a workflow imported by the one being
 * copied keeps its own shape and its own package boundary. A file outside the
 * source's root is refused, because the copy could not keep its path.
 */
function filesOf(source: Source): Copied[] {
  const copied = new Map<string, Copied>();
  const pending = [source.entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (copied.has(file)) continue;
    if (path.relative(source.root, file).startsWith("..")) {
      throw new Error(`${file} is imported from outside ${source.root}, so a copy could not keep its path`);
    }
    const rewrites = new Map<string, string>();
    for (const written of relativeImports(fs.readFileSync(file, "utf-8"))) {
      const reached = resolved(path.dirname(file), written, file);
      const asWritten = path.resolve(path.dirname(file), written);
      // Node imports the file a specifier names and nothing else, so a
      // `.js` that stood for its `.ts` is rewritten to the file copied.
      if (reached !== asWritten) rewrites.set(written, relativeSpecifier(path.dirname(file), reached));
      pending.push(reached);
    }
    copied.set(file, { file, rewrites });
  }
  for (const directory of directoriesOf(source.root, [...copied.keys()])) {
    for (const boundary of [DIAGRAM_FILE, "package.json"]) {
      const file = path.join(directory, boundary);
      if (fs.existsSync(file) && !copied.has(file)) copied.set(file, { file, rewrites: new Map() });
    }
  }
  const diagram = [path.dirname(source.entry), source.root].map((directory) => path.join(directory, DIAGRAM_FILE)).find((candidate) => copied.has(candidate));
  if (!diagram) throw new Error(`${source.root} has no ${DIAGRAM_FILE}, so what it would copy is not a workflow`);
  return [...copied.values()];
}

/** Every directory from the source's root down to each file. */
function directoriesOf(root: string, files: readonly string[]): Set<string> {
  const directories = new Set<string>([root]);
  for (const file of files) {
    for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) {
      directories.add(directory);
      if (directory === root) break;
    }
  }
  return directories;
}

/** The specifiers of `import … from "./x"`, `export … from "./x"` and `import("./x")`. */
function relativeImports(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g)) found.add(match[1]!);
  return [...found];
}

/** A relative specifier as a file: as written, or the TypeScript a `.js` specifier stands for. */
function resolved(directory: string, specifier: string, from: string): string {
  const exact = path.resolve(directory, specifier);
  const candidates = [exact, exact.replace(/\.js$/, ".ts"), `${exact}.ts`, `${exact}.js`, path.join(exact, "index.ts"), path.join(exact, "index.js")];
  const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) throw new Error(`${from} imports ${specifier}, which is not there`);
  return file;
}

function relativeSpecifier(from: string, to: string): string {
  const relative = path.relative(from, to).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/**
 * What the copy depends on that its caller does not, as `name@range`, every
 * one checked against the registry before anything is written. A dependency
 * the caller already holds is skipped only when the version it holds is one
 * the copy can use; one it cannot is refused, because the copy would resolve
 * the caller's.
 */
async function dependenciesToInstall(
  source: Source,
  files: readonly Copied[],
  owned: Manifest,
  caller: string,
  runner: CommandRunner,
  spec: string,
): Promise<string[]> {
  const needed: string[] = [];
  const problems: string[] = [];
  for (const [dependency, range] of wantedBy(files)) {
    const held = owned.dependencies?.[dependency];
    const problem = held === undefined
      ? await unresolvable(runner, dependency, range)
      : unusable(caller, dependency, range, held);
    if (problem) problems.push(problem);
    else if (held === undefined) needed.push(`${dependency}@${range}`);
  }
  if (problems.length > 0) {
    throw new Error(`${source.manifest.name ?? spec} depends on ${problems.join("; ")}; nothing was copied`);
  }
  return needed;
}

/** Every dependency any manifest in the copy names, the deepest one's range last. */
function wantedBy(files: readonly Copied[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const { file } of files) {
    if (path.basename(file) !== "package.json") continue;
    for (const [dependency, range] of Object.entries(manifestAt(path.dirname(file)).dependencies ?? {})) wanted.set(dependency, range);
  }
  return wanted;
}

async function unresolvable(runner: CommandRunner, dependency: string, range: string): Promise<string | undefined> {
  return (await resolvable(runner, dependency, range)) ? undefined : `${dependency}@${range}, which cannot be resolved`;
}

/** Why the version the caller holds will not do for the copy, or nothing when it will. */
function unusable(caller: string, dependency: string, range: string, declared: string): string | undefined {
  if (declared === range) return undefined;
  const held = installedVersion(caller, dependency);
  if (held !== undefined && satisfies(held, range)) return undefined;
  return `${dependency}@${range}, and ${path.basename(caller)} holds ${held ?? declared}`;
}

function installedVersion(caller: string, dependency: string): string | undefined {
  const file = path.join(caller, "node_modules", ...dependency.split("/"), "package.json");
  if (!fs.existsSync(file)) return undefined;
  return (JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: string }).version;
}

function versionOf(value: string): number[] | undefined {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return parts ? parts.slice(1, 4).map(Number) : undefined;
}

/** Negative, zero or positive, as `a` sorts before, with or after `b`. */
function compared(a: readonly number[], b: readonly number[]): number {
  return a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
}

/**
 * Whether a version is in a range, for the ranges a workflow's manifest
 * writes: exact, `^`, `~` and `*`. Anything else is not guessed at.
 */
function satisfies(version: string, range: string): boolean {
  if (range === "*" || range === "latest") return true;
  const operator = /^[\^~]/.exec(range)?.[0] ?? "";
  const held = versionOf(version);
  const floor = versionOf(range.slice(operator.length));
  if (!held || !floor) return false;
  if (operator === "") return compared(held, floor) === 0;
  // A tilde keeps the minor fixed; a caret keeps the leftmost non-zero part.
  const fixed = operator === "~" ? 1 : floor.findIndex((part, index) => part > 0 || index === 2);
  return compared(held, floor) >= 0 && held.slice(0, fixed + 1).every((part, index) => part === floor[index]);
}

/** Whether the registry knows a version of a dependency in the range a callee asks for. */
async function resolvable(runner: CommandRunner, dependency: string, range: string): Promise<boolean> {
  const asked = await runner.run("npm", ["view", `${dependency}@${range}`, "version", "--json"]);
  return asked.ok && asked.stdout.trim() !== "" && asked.stdout.trim() !== "[]";
}
