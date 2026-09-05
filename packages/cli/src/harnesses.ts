import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A harness this machine has, and where it looks for skills.
 *
 * Not every harness has the same idea of what a skill is. The two here read
 * a `SKILL.md` per directory; a harness that reads something else is a
 * translation rather than a copy, and it is left out until somebody writes
 * that translation rather than being half-supported.
 */
export interface Harness {
  readonly name: string;
  /** What proves it is installed: its own directory, not a binary on PATH. */
  readonly marker: string;
  readonly skills: string;
}

export function harnesses(home: string = os.homedir()): Harness[] {
  return [
    { name: "claude", marker: path.join(home, ".claude"), skills: path.join(home, ".claude", "skills") },
    { name: "hermes", marker: path.join(home, ".hermes"), skills: path.join(home, ".hermes", "skills") },
  ];
}

/** The ones actually on this machine, which is what a menu should offer. */
export function installedHarnesses(home?: string): Harness[] {
  return harnesses(home).filter((harness) => fs.existsSync(harness.marker));
}

/**
 * Writes every skill into one harness's directory.
 *
 * A skill is one directory holding one `SKILL.md`, which is what both of
 * these read. Overwriting is deliberate: these are amy's own, they travel
 * with the version installed, and a skill telling you to run a command your
 * `amy` predates is worse than no skill.
 */
export function install(into: string, skills: readonly [string, string][]): string[] {
  const files: string[] = [];

  for (const [name, body] of skills) {
    const directory = path.join(into, name);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "SKILL.md");
    fs.writeFileSync(file, body, "utf-8");
    files.push(file);
  }

  return files;
}
