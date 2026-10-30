import path from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin, withDiagramBeside } from "@amykit/core";

/**
 * The plugin, shaped by the `workflow.mmd` beside the entry it was imported
 * from, the way the entry itself was found: beside a workflow of your own,
 * or at the root of the package. Nothing names the file, and a plugin with
 * none beside it is returned as it is.
 */
export function drawn(plugin: Plugin, specifier: string): Plugin {
  const entry = entryOf(specifier);
  return entry ? withDiagramBeside(plugin, entry) : plugin;
}

/** The file an import specifier names, or nothing when it cannot be told. */
function entryOf(specifier: string): string | undefined {
  if (specifier.startsWith("file:")) return fileURLToPath(specifier);
  if (path.isAbsolute(specifier)) return specifier;
  try {
    const resolved = import.meta.resolve(specifier);
    return resolved.startsWith("file:") ? fileURLToPath(resolved) : undefined;
  } catch {
    return undefined;
  }
}
