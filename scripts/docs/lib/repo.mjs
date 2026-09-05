import fs from "node:fs";
import path from "node:path";

/** The workspace root, found from this file rather than from the cwd. */
export const ROOT = path.resolve(import.meta.dirname, "../../..");

export const DOCS = path.join(ROOT, "docs");

export function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

export function readIfPresent(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

export function readJson(relative) {
  return JSON.parse(read(relative));
}

/** Every directory holding a package, in the two workspace roots. */
export function workspaceDirectories() {
  const found = [];

  for (const group of ["packages", "plugins"]) {
    const base = path.join(ROOT, group);
    if (!fs.existsSync(base)) continue;

    for (const entry of fs.readdirSync(base).sort()) {
      const dir = path.join(base, entry);
      if (fs.existsSync(path.join(dir, "package.json"))) found.push({ group, dir, entry });
    }
  }

  return found;
}

/** Markdown files under `docs/`, relative to it, sorted, excluding dotfiles. */
export function docFiles(from = DOCS, prefix = "") {
  const found = [];

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
