import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A harness this machine has, and where it looks for skills.
 *
 * Not every harness has the same idea of what a skill is. The three here read
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
    { name: "codex", marker: path.join(home, ".codex"), skills: path.join(home, ".codex", "skills") },
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
    // A link `harnessSkills` made for a harness's skill of the same name is
    // replaced by amy's own copy, never written through into the harness.
    if (fs.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(directory);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "SKILL.md");
    fs.writeFileSync(file, body, "utf-8");
    files.push(file);
  }

  return files;
}

/** A mounted harness whose own skills may be linked: its plugin's name, and where they are. */
export interface LinkableHarness {
  readonly name: string;
  readonly skills: string;
}

/**
 * Links each skill of every harness `chosen` sets to true into amy's own
 * root, one link per skill, and removes the links it made that are no longer
 * wanted: the harness set to false or left out, its plugin no longer
 * mounted, or the skill gone from it.
 *
 * Nothing is copied, so nothing of the harness's is kept in amy's root. amy's
 * own copy of a skill, or anything else already there, wins over a link. The
 * links made are kept in `record`, so only those are ever removed.
 */
export function linkHarnessSkills(own: string, record: string, chosen: unknown, mounted: readonly LinkableHarness[]): string[] {
  // Not a mapping is a broken setting, not "every harness off": the links
  // stay as they are until it is fixed.
  if (typeof chosen !== "object" || chosen === null || Array.isArray(chosen)) {
    throw new Error("`harnessSkills` must be a mapping of harness to true or false; the links are left as they are");
  }
  const wanted = wantedLinks(chosen as Record<string, unknown>, mounted);
  const made = readLinks(record);
  const said = unlinkUnwanted(own, made, wanted);

  // Recorded before it is made: a link amy cannot record is never made, so a
  // later false always finds every link amy owns. A recorded link that then
  // fails to be made is harmless, since only a link pointing at its recorded
  // target is ever removed.
  const making = [...wanted].filter(([name]) => !fs.lstatSync(path.join(own, name), { throwIfNoEntry: false }));
  for (const [name, target] of making) made[name] = target;
  saveLinks(record, made);

  fs.mkdirSync(own, { recursive: true });
  for (const [name, target] of making) {
    fs.symlinkSync(target, path.join(own, name), "dir");
    said.push(`linked ${name} -> ${target}`);
  }
  return said;
}

/** Each skill of every harness set to true, by name, the first harness to hold a name winning. */
function wantedLinks(choice: Record<string, unknown>, mounted: readonly LinkableHarness[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const harness of mounted.filter((one) => choice[one.name] === true)) {
    for (const name of skillsIn(harness.skills)) {
      if (!wanted.has(name)) wanted.set(name, path.join(harness.skills, name));
    }
  }
  return wanted;
}

/** Removes from `made`, and from amy's root, every link no longer wanted; only a link still pointing where amy made it is unlinked. */
function unlinkUnwanted(own: string, made: Record<string, string>, wanted: ReadonlyMap<string, string>): string[] {
  const said: string[] = [];
  for (const [name, target] of Object.entries(made)) {
    if (wanted.get(name) === target) continue;
    const at = path.join(own, name);
    if (fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink() && fs.readlinkSync(at) === target) fs.unlinkSync(at);
    delete made[name];
    said.push(`unlinked ${name}`);
  }
  return said;
}

/** Replaces the record whole, so a write that fails leaves the previous one. */
function saveLinks(record: string, made: Record<string, string>): void {
  fs.mkdirSync(path.dirname(record), { recursive: true });
  const next = `${record}.${process.pid}.tmp`;
  fs.writeFileSync(next, `${JSON.stringify(made, null, 2)}\n`, "utf-8");
  try {
    fs.renameSync(next, record);
  } catch (error) {
    fs.rmSync(next, { force: true });
    throw error;
  }
}

/** The skills a harness's directory holds: each directory with a SKILL.md in it. */
function skillsIn(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => fs.existsSync(path.join(directory, name, "SKILL.md"))).sort();
}

function readLinks(record: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(record, "utf-8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}
