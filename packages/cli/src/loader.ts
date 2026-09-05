import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin } from "@amykit/core";

export interface LoadResult {
  plugins: Plugin[];
  problems: string[];
}

/**
 * Imports each plugin by name and takes its `plugin` export.
 *
 * Nothing is compiled in. A plugin is a package the package manager put on
 * disk, or a path, and it resolves at run time like any other import — which
 * is what lets an install carry a plugin this repository has never heard of,
 * and lets a machine skip the ones it has no use for.
 */
export async function load(specs: readonly string[]): Promise<LoadResult> {
  const plugins: Plugin[] = [];
  const problems: string[] = [];

  for (const spec of specs) {
    try {
      const module = (await import(spec)) as { plugin?: Plugin };
      if (!module.plugin) {
        problems.push(`${spec}: imported, but exports no \`plugin\``);
        continue;
      }
      plugins.push(module.plugin);
    } catch (error) {
      problems.push(missing(spec, error));
    }
  }

  return { plugins, problems };
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

function missing(spec: string, error: unknown): string {
  const why = error instanceof Error ? error.message : String(error);
  if (!isUnresolved(error)) return `${spec}: could not be imported — ${why}`;

  return `${spec}: ${NOT_INSTALLED} — install it, or drop it from the config`;
}

/** Node's own word for "no such package", told apart from a plugin that threw. */
function isUnresolved(error: unknown): boolean {
  return (error as { code?: string })?.code === "ERR_MODULE_NOT_FOUND";
}

/**
 * What this install could mount, read off disk rather than off a list.
 *
 * Walks up from this module the way Node's own resolution does, so it sees
 * the same `node_modules` an import would. Only names that look like a plugin
 * or a workflow are reported: the rest is the dependency tree, and nobody
 * mounting a plugin wants to read it.
 */
export function installedPlugins(from: URL = new URL("./", import.meta.url)): string[] {
  const found = new Set<string>();

  let directory = fileURLToPath(from);
  for (let depth = 0; depth < 12; depth += 1) {
    for (const name of packagesIn(path.join(directory, "node_modules"))) {
      if (/(^|\/)(plugin|workflow)-/.test(name)) found.add(name);
    }

    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
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
