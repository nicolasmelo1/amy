import fs from "node:fs";
import path from "node:path";

/**
 * Parses a .env file.
 *
 * Deliberately small and its own function rather than a dependency, because
 * the only thing it has to hold is an API key and the failure mode of a
 * clever parser is a credential that silently does not load.
 */
export function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equals = withoutExport.indexOf("=");
    if (equals <= 0) continue;

    const key = withoutExport.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = unquote(withoutExport.slice(equals + 1).trim());
  }

  return values;
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));

  return quoted && value.length >= 2 ? value.slice(1, -1) : value;
}

/**
 * Loads a .env from the working directory into the environment.
 *
 * An entry already present in the environment wins, so exporting a key for
 * one command stays a reliable way to override the file.
 *
 * Returns the names it set, never the values, so a caller can report what
 * happened without printing a secret.
 */
export function loadEnv(root: string): string[] {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return [];

  const applied: string[] = [];

  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf-8")))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }

  return applied;
}
