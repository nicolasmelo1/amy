import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The skills that travel with this version of amy.
 *
 * Read off disk beside the code rather than listed here, so adding one is a
 * directory and not an edit in two places. They are inside the package for
 * the same reason `sf` compiles its own in: a skill that tells you to run a
 * subcommand your install predates is worse than no skill.
 */
export function shipped(from: URL = new URL("../skills/", import.meta.url)): [string, string][] {
  const directory = fileURLToPath(from);
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory)
    .map((name) => [name, path.join(directory, name, "SKILL.md")] as const)
    .filter(([, file]) => fs.existsSync(file))
    .map(([name, file]) => [name, fs.readFileSync(file, "utf-8")]);
}
