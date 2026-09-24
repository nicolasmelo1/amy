import fs from "node:fs";
import path from "node:path";

/**
 * Which harnesses amy's skills were written into, recorded when `amy skills`
 * runs because it is a fact about this machine.
 *
 * The update that rewrites the skills needs this record rather than a guess
 * from what is installed now: `~/.claude` being present today does not mean
 * the skills were ever written into it, and writing them into a harness
 * somebody never chose is a decision nobody made. The file lives under
 * `~/.amy` beside the rest of this machine's state, so a second machine-wide
 * install (`AMY_HOME`) keeps its own.
 */
const RECORD = "skills-written.json";

export interface SkillsRecord {
  /** The harnesses the skills were written into, by name, most recent last. */
  harnesses: string[];
  /** A directory `--dir` named, which no harness table knows. */
  directories: string[];
}

function recordPath(home: string): string {
  return path.join(home, RECORD);
}

export function readSkills(home: string): SkillsRecord {
  try {
    const parsed = JSON.parse(fs.readFileSync(recordPath(home), "utf-8")) as Partial<SkillsRecord>;
    return {
      harnesses: Array.isArray(parsed.harnesses) ? parsed.harnesses : [],
      directories: Array.isArray(parsed.directories) ? parsed.directories : [],
    };
  } catch {
    return { harnesses: [], directories: [] };
  }
}

/** Adds one write to the record, keeping the order stable and unique. */
export function recordWrite(home: string, write: { harness?: string; directory?: string }): void {
  const current = readSkills(home);
  const harnesses = write.harness && !current.harnesses.includes(write.harness)
    ? [...current.harnesses, write.harness]
    : current.harnesses;
  const directories = write.directory && !current.directories.includes(write.directory)
    ? [...current.directories, write.directory]
    : current.directories;

  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(recordPath(home), `${JSON.stringify({ harnesses, directories }, null, 2)}\n`, "utf-8");
}

/**
 * Writes the skills into every harness and directory the record names.
 *
 * Used by `amy skills` itself and by `amy update` when the CLI moved: the
 * record is the fact, the write is the same one `amy skills` performed, and a
 * directory the record names but that no longer exists is skipped with a
 * line rather than recreated — a directory an operator deleted was deleted on
 * purpose.
 */
export function writeSkills(
  home: string,
  install: (into: string, skills: readonly [string, string][]) => string[],
  shipped: () => readonly [string, string][],
  harnessSkills: (name: string) => string | undefined,
): string[] {
  const record = readSkills(home);
  const skills = shipped();
  const wrote: string[] = [];

  for (const harness of record.harnesses) {
    const into = harnessSkills(harness);
    if (!into) {
      console.log(`${harness}: no longer a harness this amy knows, skipped`);
      continue;
    }
    wrote.push(...install(into, skills));
    console.log(`${harness}: ${skills.length} skill(s) rewritten`);
  }

  for (const directory of record.directories) {
    if (!fs.existsSync(directory)) {
      console.log(`${directory}: gone, skipped`);
      continue;
    }
    wrote.push(...install(directory, skills));
    console.log(`${directory}: ${skills.length} skill(s) rewritten`);
  }

  return wrote;
}