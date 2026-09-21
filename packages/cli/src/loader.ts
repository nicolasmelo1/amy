import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { Plugin } from "@amykit/core";
import { localWorkflow } from "./workflow.js";
import { packageEntrySpecifier } from "./spec.js";

export interface LoadResult {
  plugins: Plugin[];
  problems: string[];
  // What was asked for, against what came back. A plugin's own `name` is not
  // the spec that found it — a workflow of your own is asked for by its
  // directory, `oncall`, and calls itself `workflow-oncall` — so a caller
  // matching one against the other reports a plugin it just loaded as missing.
  bySpec: Map<string, Plugin>;
}

/**
 * Imports each plugin by name and takes its `plugin` export.
 *
 * Nothing is compiled in. A plugin is a package the package manager put on
 * disk, or a path, and it resolves at run time like any other import — which
 * is what lets an install carry a plugin this repository has never heard of,
 * and lets a machine skip the ones it has no use for.
 *
 * Resolution is explicit rather than inherited: a package is looked up in the
 * npm root amy's state directory holds, exactly the way Node would resolve it
 * from inside that root, so where this file happens to sit has nothing to do
 * with what an install can mount.
 */
export async function load(
  specs: readonly string[],
  resolve: (spec: string) => string = (spec) => spec,
  pluginsRoot?: string,
): Promise<LoadResult> {
  const plugins: Plugin[] = [];
  const problems: string[] = [];
  const bySpec = new Map<string, Plugin>();

  for (const spec of specs) {
    try {
      const module = (await import(resolve(spec))) as { plugin?: Plugin };
      if (!module.plugin) {
        problems.push(`${spec}: imported, but exports no \`plugin\``);
        continue;
      }
      plugins.push(module.plugin);
      bySpec.set(spec, module.plugin);
    } catch (error) {
      problems.push(missing(spec, error, pluginsRoot));
    }
  }

  return { plugins, problems, bySpec };
}

/**
 * What a refusal says when the package is simply not there.
 *
 * The failure the compiled-in table used to make impossible, and the one it
 * leaves behind: a config naming something nobody installed. Said in the same
 * words every time so a caller can tell it from a plugin that threw, and
 * answer it once with what *is* installed.
 */
export const NOT_INSTALLED = "not installed";
const PLUGIN_NOT_INSTALLED = "AMY_PLUGIN_NOT_INSTALLED";

function missing(spec: string, error: unknown, pluginsRoot?: string): string {
  const why = error instanceof Error ? error.message : String(error);
  if (!isUnresolved(error, pluginsRoot)) return `${spec}: could not be imported — ${why}`;

  return `${spec}: ${NOT_INSTALLED} — install it, or drop it from the config${pluginsRoot ? ` (${pluginsRoot})` : ""}`;
}

/** Node's own word for "no such package", told apart from a plugin that threw. */
function isUnresolved(error: unknown, pluginsRoot?: string): boolean {
  const code = (error as { code?: string })?.code;
  return code === PLUGIN_NOT_INSTALLED || (!pluginsRoot && code === "ERR_MODULE_NOT_FOUND");
}

/**
 * What this install could mount, read off one directory rather than walked.
 *
 * The npm root amy keeps under its state directory holds the packages amy's
 * config may name, and the walk Node does from this module's own location
 * cannot see it — the command's file sits in a checkout or an install
 * prefix, and the root sits in `.amy`. Reading it directly makes the listing
 * an answer instead of a heuristic that pattern-matches whatever a parent
 * walk happened to find, and stops the refusal's "installed instead" list
 * depending on how amy itself was put on the machine.
 */
export function installedPlugins(root: string): string[] {
  const found = new Set<string>();

  for (const name of packagesIn(path.join(root, "node_modules"))) {
    if (/(^|\/)(plugin|workflow)-/.test(name)) found.add(name);
  }

  return [...found].sort();
}

/** Every package name in one `node_modules`, scopes walked one level in. */
function packagesIn(directory: string): string[] {
  const names: string[] = [];

  for (const entry of read(directory)) {
    if (entry.startsWith("@")) {
      names.push(...read(path.join(directory, entry)).map((inner) => `${entry}/${inner}`));
      continue;
    }
    if (!entry.startsWith(".")) names.push(entry);
  }

  return names;
}

/** Returns nothing rather than throwing: a directory that is not there is an answer. */
function read(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

/**
 * The resolver that turns a spec into something `import()` takes, through the
 * npm root amy's state directory keeps.
 *
 * `createRequire(<root>/package.json)` is Node's resolution algorithm anchored
 * at that root, so a name resolves to the file inside it exactly as it would
 * for a module living there — the same walk, made explicit instead of
 * inherited from wherever amy's own file happens to sit. The file Node names
 * is then imported as a `file:` URL. A workflow of your own is resolved by
 * its directory first, and a spec that is a path resolves as itself; both
 * arrive here already a specifier, because that is what the resolver contract
 * has always handed `import()`.
 */
export function pluginsRootResolver(home: string, pluginsRoot: string): (spec: string) => string {
  const manifest = path.join(pluginsRoot, "package.json");

  return (spec: string) => {
    const local = localWorkflow(home, spec);
    if (local) return local;

    // A specifier that is already a URL — a path spec the CLI resolved to its
    // own entry — is not Node's to walk, and handing it to the resolver
    // rooted at `<root>/package.json` would answer nothing useful.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) return spec;
    if (path.isAbsolute(spec) || spec.startsWith("./") || spec.startsWith("../")) return pathToFileURL(path.resolve(spec)).href;

    const requireFromRoot = createRequire(manifest);
    try {
      return pathToFileURL(resolvedInPluginsRoot(pluginsRoot, spec, requireFromRoot.resolve(spec))).href;
    } catch (error) {
      // `createRequire` follows CommonJS's conditions, so an ESM-only package
      // exporting just an `import` arm is deliberately invisible to it even
      // though `import()` can load it. The root still tells us exactly where
      // npm put that package; read its entry with the ESM walk used for a path
      // spec, rather than falling back to amy's own parents or a second list.
      const code = (error as { code?: string })?.code;
      if (code === "MODULE_NOT_FOUND") throw pluginNotInstalled(spec);
      if (code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
      return packageEntrySpecifier(packageDirectory(pluginsRoot, spec));
    }
  };
}

function pluginNotInstalled(spec: string): Error & { code: string } {
  const error = new Error(`${spec} is not in amy's plugins root`) as Error & { code: string };
  error.code = PLUGIN_NOT_INSTALLED;
  return error;
}

/** The directory npm gives one exact package name beneath this root. */
function packageDirectory(root: string, spec: string): string {
  const parts = spec.startsWith("@") ? spec.split("/", 2) : [spec.split("/", 1)[0]!];
  return path.join(root, "node_modules", ...parts);
}

/** Refuse Node's parent walk: this root is the complete installation boundary. */
function resolvedInPluginsRoot(root: string, spec: string, resolved: string): string {
  // npm can link a local package into this root. `require.resolve` follows
  // that link to its source, but the link itself is the root-owned install.
  if (fs.existsSync(packageDirectory(root, spec))) return resolved;

  const nodeModulesPath = path.join(root, "node_modules");
  const nodeModules = fs.existsSync(nodeModulesPath) ? fs.realpathSync(nodeModulesPath) : path.resolve(nodeModulesPath);
  const physicalResolved = fs.realpathSync(resolved);
  const relative = path.relative(nodeModules, physicalResolved);
  if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) return physicalResolved;
  throw pluginNotInstalled(spec);
}