import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORE_ACTIONS, dispatchesTo } from "@amykit/core";
import { SkillLadders } from "@amykit/agent-kit";

export type SkillsResult =
  | { ok: true; ladders: SkillLadders }
  | { ok: false; problems: string[] };

/** The step the conversation itself is: a chat turn reaches the agent with no workflow action. */
export const CHAT_STEP = "chat";

/**
 * Where amy installs the skills it ships, under the machine's own state.
 *
 * Every install writes them here, whether or not a harness directory was
 * chosen: this is the copy amy owns, and the one the chat reads.
 */
export function ownSkillRoot(state: string): string {
  return path.join(state, "skills");
}

/**
 * Where installed skills are looked for, in order: amy's own root, then the
 * roots the config names. A harness's own directory is not one of them: its
 * skills are seen only when `harnessSkills` chooses it.
 *
 * The first root that holds a skill is where the harness is handed it, so
 * this order is the answer to "which copy did a step use".
 */
export function skillRoots(configured: readonly string[], state: string): readonly string[] {
  return [...new Set([ownSkillRoot(state), ...configured])];
}

/** A harness as `harnessSkills` reads it: its plugin's name, and where its own skills are. */
export interface SkillfulHarness {
  readonly name: string;
  readonly skillsDirectory?: string;
}

export type HarnessSkillsResult =
  | { ok: true; directories: string[] }
  | { ok: false; problems: string[] };

/**
 * Reads `harnessSkills`: which mounted harnesses' own skills amy links in, by
 * the name of the harness's plugin, and the directories that holds.
 *
 * The names are the harnesses that mounted, never a list kept here: a name no
 * plugin contributed is a typo, and a harness whose plugin does not say where
 * its skills are cannot be chosen.
 */
export function parseHarnessSkills(value: unknown, mounted: readonly SkillfulHarness[]): HarnessSkillsResult {
  if (value === undefined) return { ok: true, directories: [] };
  if (!isRecord(value)) return { ok: false, problems: ["`harnessSkills` must be a mapping of harness to true or false"] };

  const names = [...new Set(mounted.map((one) => one.name))];
  const problems: string[] = [];
  const directories: string[] = [];
  for (const [name, chosen] of Object.entries(value)) {
    const harness = mounted.find((one) => one.name === name);
    if (!harness) {
      problems.push(`\`harnessSkills.${name}\` names no harness that mounted: ${names.join(", ") || "none"}`);
    } else if (typeof chosen !== "boolean") {
      problems.push(`\`harnessSkills.${name}\` must be true or false`);
    } else if (chosen && !harness.skillsDirectory) {
      problems.push(`\`harnessSkills.${name}\`: ${name} does not say where its skills are, so they cannot be linked`);
    } else if (chosen && harness.skillsDirectory) {
      directories.push(harness.skillsDirectory);
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, directories };
}

/**
 * Reads the `skills` setting: a ladder of skills per step.
 *
 * The keys are the workflow's own action names rather than a second
 * vocabulary, and only the ones that reach an agent can be handed to a skill.
 * A step nobody dispatches to an agent is a typo, and it is cheaper to say so
 * at boot than to leave a ladder that never fires.
 */
export function parseSkills(value: unknown): SkillsResult {
  if (value === undefined) return { ok: true, ladders: {} };
  if (!isRecord(value)) return { ok: false, problems: ["`skills` must be a mapping of step to skills"] };

  const problems: string[] = [];
  const ladders: Record<string, string[]> = {};

  for (const [step, named] of Object.entries(value)) {
    // The conversation is one more step an agent performs, named `chat`; its
    // skills are what a message may start with.
    if (step !== CHAT_STEP && !dispatchesTo(step, "agent")) {
      problems.push(`\`skills.${step}\` is not a step an agent performs: ${agentSteps().join(", ")}, or \`${CHAT_STEP}\` for the conversation`);
      continue;
    }

    const ladder = ladderIn(step, named, problems);
    if (ladder) ladders[step] = ladder;
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, ladders };
}

/** Every skill named across every step, once each. */
export function skillsNamed(ladders: SkillLadders): string[] {
  return [...new Set(Object.values(ladders).flat())];
}

/**
 * The skills installed on this machine, by name.
 *
 * A directory holding a `SKILL.md` is what "installed" means, which is the
 * same thing the harness itself looks for. Asking the filesystem rather than
 * the harness keeps this answerable at boot, before anything is run.
 */
export function installedSkills(roots: readonly string[]): string[] {
  const found = roots.flatMap((root) => skillsUnder(expandHome(root)));
  return [...new Set(found)].sort();
}

/**
 * The directory a skill is installed in, from the first root that holds it.
 *
 * The same roots, in the same order, `installedSkills` answered from, so a
 * skill the mount accepted is a skill this finds.
 */
export function locateSkill(roots: readonly string[], skill: string): string | undefined {
  for (const root of roots) {
    const directory = path.join(expandHome(root), skill);
    if (fs.existsSync(path.join(directory, "SKILL.md"))) return directory;
  }
  return undefined;
}

function skillsUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}

function ladderIn(step: string, named: unknown, problems: string[]): string[] | null {
  if (!Array.isArray(named) || named.some((name) => typeof name !== "string")) {
    problems.push(`\`skills.${step}\` must be a list of skill names, such as [/logion]`);
    return null;
  }

  if (named.length === 0) {
    problems.push(`\`skills.${step}\` names no skill, so it decides nothing`);
    return null;
  }

  // Written with the leading slash, because that is how a skill is invoked
  // and how anyone reading the config will recognise it.
  return (named as string[]).map((name) => name.replace(/^\//, ""));
}

function agentSteps(): string[] {
  return Object.keys(CORE_ACTIONS).filter((action) => dispatchesTo(action, "agent"));
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
