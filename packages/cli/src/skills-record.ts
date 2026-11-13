import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where amy keeps every skill it ships, under its own state.
 *
 * Written on every install and every update, whether or not a harness was
 * chosen: it is the copy amy owns, and the one the chat lends a skill from.
 */
export function ownSkillRoot(home: string): string {
  return path.join(home, "skills");
}

/**
 * Where an installed skill is looked for: amy's own root, then the roots the
 * config names. A harness's own skills are seen only when `harnessSkills`
 * links them into amy's root.
 *
 * The relay keeps the same order in `plugins/agent-relay/src/skills.ts`. It is
 * written twice because a machine carries only the plugins it mounted, so the
 * CLI cannot import one of them to ask.
 */
export function skillRoots(home: string, configured: readonly string[] = []): readonly string[] {
  return [...new Set([ownSkillRoot(home), ...configured])];
}

/** The directory a skill is installed in, from the first root that holds it; nothing when none does. */
export function locateSkill(roots: readonly string[], skill: string): string | undefined {
  for (const root of roots) {
    const directory = path.join(expandHome(root), skill);
    if (fs.existsSync(path.join(directory, "SKILL.md"))) return directory;
  }
  return undefined;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

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

/** amy's own root, then every harness and directory the record names that is still there. */
function skillTargets(home: string, harnessSkills: (name: string) => string | undefined, say: (line: string) => void = () => undefined): { label: string; into: string }[] {
  const record = readSkills(home);
  const own = ownSkillRoot(home);
  const targets: { label: string; into: string }[] = [{ label: own, into: own }];
  for (const harness of record.harnesses) {
    const into = harnessSkills(harness);
    if (!into) {
      say(`${harness}: no longer a harness this amy knows, skipped`);
      continue;
    }
    targets.push({ label: harness, into });
  }
  for (const directory of record.directories) {
    if (!fs.existsSync(directory)) {
      say(`${directory}: gone, skipped`);
      continue;
    }
    targets.push({ label: directory, into: directory });
  }
  return targets;
}

/** One skill as it stood: a link, or a directory and the SKILL.md it held. */
type Kept = { link: string } | { body: string | undefined };

/**
 * What every skills target holds now, put back whole by the function it
 * returns: each skill's SKILL.md, a harness's skill linked in as the link it
 * was, and a skill that was not there taken away. Nothing is written through
 * a link.
 */
export function keepSkills(home: string, harnessSkills: (name: string) => string | undefined): () => void {
  const kept = skillTargets(home, harnessSkills).map(({ into }) => ({ into, skills: skillsAt(into) }));
  return () => {
    for (const { into, skills } of kept) {
      for (const [name] of skillsAt(into)) {
        if (!skills.has(name)) fs.rmSync(path.join(into, name), { recursive: true, force: true });
      }
      for (const [name, was] of skills) {
        const directory = path.join(into, name);
        if ("link" in was) {
          fs.rmSync(directory, { recursive: true, force: true });
          fs.symlinkSync(was.link, directory, "dir");
        } else if (was.body !== undefined) {
          if (fs.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(directory);
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(path.join(directory, "SKILL.md"), was.body, "utf-8");
        }
      }
    }
  };
}

/** The skills a target holds, by name: each link, and each directory with a SKILL.md. */
function skillsAt(into: string): Map<string, Kept> {
  const skills = new Map<string, Kept>();
  if (!fs.existsSync(into)) return skills;
  for (const name of fs.readdirSync(into)) {
    const directory = path.join(into, name);
    if (fs.lstatSync(directory).isSymbolicLink()) skills.set(name, { link: fs.readlinkSync(directory) });
    else if (fs.existsSync(path.join(directory, "SKILL.md"))) skills.set(name, { body: fs.readFileSync(path.join(directory, "SKILL.md"), "utf-8") });
  }
  return skills;
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
  const skills = shipped();
  // amy's own root is written on every install and every update, whether or
  // not a harness was chosen: it is the copy amy owns, and the one the chat
  // reads a skill from.
  fs.mkdirSync(ownSkillRoot(home), { recursive: true });
  const targets = skillTargets(home, harnessSkills, (line) => console.log(line));

  // The CLI is rolled back when this rewrite fails. Keep every target as it
  // is first, so a failure on a later target cannot leave earlier harnesses
  // describing the CLI version that did not survive.
  const putBack = keepSkills(home, harnessSkills);
  const wrote: string[] = [];
  try {
    for (const target of targets) {
      wrote.push(...install(target.into, skills));
      console.log(`${target.label}: ${skills.length} skill(s) rewritten`);
    }
    return wrote;
  } catch (error) {
    putBack();
    throw error;
  }
}