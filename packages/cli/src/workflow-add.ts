import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { CommandRunner, DIAGRAM_FILE } from "@amykit/core";
import { workflowsDirectory } from "./workflow.js";

interface Manifest {
  name?: string;
  main?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
}

/** Where a copied callee comes from: its root, its entry, and what it says it depends on. */
interface Source {
  readonly root: string;
  readonly entry: string;
  readonly manifest: Manifest;
}

export interface AddInto {
  readonly runner: CommandRunner;
  /** Where a package specifier is resolved from: the plugins amy installed. */
  readonly pluginsRoot?: string;
}

/**
 * Copies a workflow into another one's directory, so the caller owns it: its
 * diagram, its entry and every file the entry imports by a relative path,
 * and its manifest. What it depends on is added to the caller's manifest and
 * installed, and a dependency that cannot be resolved refuses the copy before
 * anything is written.
 *
 * Nothing updates the copy afterwards. That is the point of it — the way
 * shadcn/ui hands out a component: the source becomes the caller's to read
 * and change — and it is called the same way the package would be.
 */
export async function addWorkflowInto(home: string, spec: string, into: string, options: AddInto): Promise<string> {
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
  const needed = await dependenciesToInstall(source, JSON.parse(fs.readFileSync(callerManifest, "utf-8")) as Manifest, options.runner, spec);

  for (const file of files) {
    const to = path.join(target, path.relative(source.root, file));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(file, to);
  }
  if (needed.length === 0) return target;
  const installed = await options.runner.run("npm", ["install", "--no-audit", "--no-fund", ...needed], { cwd: caller });
  if (!installed.ok) {
    throw new Error(`copied ${name} into ${target}, and installing what it depends on failed: ${installed.stderr || installed.stdout}`);
  }
  return target;
}

/**
 * What the copy depends on that its caller does not, as `name@range`, every
 * one checked against the registry before anything is written.
 */
async function dependenciesToInstall(source: Source, owned: Manifest, runner: CommandRunner, spec: string): Promise<string[]> {
  const needed = Object.entries(source.manifest.dependencies ?? {})
    .filter(([dependency]) => !owned.dependencies?.[dependency])
    .map(([dependency, range]) => ({ dependency, range, named: `${dependency}@${range}` }));
  const unresolved: string[] = [];
  for (const { dependency, range, named } of needed) {
    if (!(await resolvable(runner, dependency, range))) unresolved.push(named);
  }
  if (unresolved.length > 0) {
    throw new Error(`${source.manifest.name ?? spec} depends on ${unresolved.join(", ")}, which cannot be resolved; nothing was copied`);
  }
  return needed.map(({ named }) => named);
}

/** A path to a directory or an entry, or a package installed where amy keeps its plugins. */
function sourceOf(spec: string, pluginsRoot: string): Source {
  const local = path.resolve(spec);
  if (fs.existsSync(local)) {
    const root = fs.statSync(local).isDirectory() ? local : packageRootOf(path.dirname(local)) ?? path.dirname(local);
    const manifest = manifestAt(root);
    const entry = fs.statSync(local).isDirectory() ? entryOf(root, manifest) : local;
    return { root, entry, manifest };
  }
  let manifestFile: string;
  try {
    manifestFile = createRequire(path.join(pluginsRoot, "package.json")).resolve(`${spec}/package.json`);
  } catch {
    throw new Error(`${spec} is neither a path nor a package installed under ${pluginsRoot}; \`amy add ${spec}\` installs it first`);
  }
  const root = path.dirname(manifestFile);
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

/** The file a workflow is entered by: what its manifest exports, or the index beside it. */
function entryOf(root: string, manifest: Manifest): string {
  const exported = typeof manifest.exports === "object" && manifest.exports !== null
    ? ((manifest.exports as Record<string, { import?: string } | string>)["."])
    : undefined;
  const named = typeof exported === "string" ? exported : exported?.import ?? manifest.main;
  const candidates = [...(named ? [named] : []), "index.ts", "index.js"].map((file) => path.join(root, file));
  const entry = candidates.find((file) => fs.existsSync(file));
  if (!entry) throw new Error(`${root} has no entry: no \`exports\`, \`main\`, index.ts or index.js`);
  return entry;
}

/** The directory a copy goes into: the package's unscoped name without its `workflow-` prefix. */
function copyName(source: Source): string {
  const named = source.manifest.name?.split("/").at(-1) ?? path.basename(source.root);
  return named.replace(/^workflow-/, "");
}

/**
 * Every file the copy needs: the diagram, the manifest, and the entry with
 * every file it reaches by a relative import, however deep. A file outside
 * the source's root is refused, because the copy could not keep its path.
 */
function filesOf(source: Source): string[] {
  const files = new Set<string>();
  const pending = [source.entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    if (path.relative(source.root, file).startsWith("..")) {
      throw new Error(`${file} is imported from outside ${source.root}, so a copy could not keep its path`);
    }
    files.add(file);
    for (const imported of relativeImports(fs.readFileSync(file, "utf-8"))) pending.push(resolved(path.dirname(file), imported, file));
  }
  const diagram = [path.dirname(source.entry), source.root].map((directory) => path.join(directory, DIAGRAM_FILE)).find((candidate) => fs.existsSync(candidate));
  if (!diagram) throw new Error(`${source.root} has no ${DIAGRAM_FILE}, so what it would copy is not a workflow`);
  files.add(diagram);
  if (fs.existsSync(path.join(source.root, "package.json"))) files.add(path.join(source.root, "package.json"));
  return [...files];
}

/** The specifiers of `import … from "./x"`, `export … from "./x"` and `import("./x")`. */
function relativeImports(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g)) found.push(match[1]!);
  return found;
}

/** A relative specifier as a file: as written, or the TypeScript a `.js` specifier stands for. */
function resolved(directory: string, specifier: string, from: string): string {
  const exact = path.resolve(directory, specifier);
  const candidates = [exact, exact.replace(/\.js$/, ".ts"), `${exact}.ts`, `${exact}.js`, path.join(exact, "index.ts"), path.join(exact, "index.js")];
  const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) throw new Error(`${from} imports ${specifier}, which is not there`);
  return file;
}

/** Whether the registry knows a version of a dependency in the range a callee asks for. */
async function resolvable(runner: CommandRunner, dependency: string, range: string): Promise<boolean> {
  const asked = await runner.run("npm", ["view", `${dependency}@${range}`, "version", "--json"]);
  return asked.ok && asked.stdout.trim() !== "" && asked.stdout.trim() !== "[]";
}
