import fs from "node:fs";
import path from "node:path";

/** The workspace root, found from this file rather than from the cwd. */
export const ROOT = path.resolve(import.meta.dirname, "../../..");

export const DOCS = path.join(ROOT, "docs");

export function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

export function readIfPresent(relative: string): string | null {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

export function readJson<T>(relative: string): T {
  return JSON.parse(read(relative)) as T;
}

export interface WorkspaceDirectory {
  group: string;
  dir: string;
  entry: string;
}

/**
 * Every directory holding a package, in the three workspace roots.
 *
 * `examples/` also holds folders that are a project rather than a package, like
 * `a-whole-project`: they declare no entry point, so nothing is built to read.
 */
export function workspaceDirectories(): WorkspaceDirectory[] {
  const found: WorkspaceDirectory[] = [];

  for (const group of ["packages", "plugins", "examples"]) {
    const base = path.join(ROOT, group);
    if (!fs.existsSync(base)) continue;

    for (const entry of fs.readdirSync(base).sort()) {
      const dir = path.join(base, entry);
      if (hasEntryPoint(path.join(dir, "package.json"))) found.push({ group, dir, entry });
    }
  }

  return found;
}

/** Markdown files under `docs/`, relative to it, sorted, excluding dotfiles. */
export function docFiles(from = DOCS, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(from).sort()) {
    if (entry.startsWith(".")) continue;

    const full = path.join(from, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;

    if (fs.statSync(full).isDirectory()) {
      found.push(...docFiles(full, relative));
      continue;
    }
    if (entry.endsWith(".md")) found.push(relative);
  }

  return found;
}

function hasEntryPoint(manifest: string): boolean {
  if (!fs.existsSync(manifest)) return false;
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as { main?: string; exports?: unknown };
  return parsed.main !== undefined || parsed.exports !== undefined;
}
