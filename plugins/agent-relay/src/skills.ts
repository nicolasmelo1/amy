import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORE_ACTIONS, dispatchesTo } from "@amykit/core";
import { SkillLadders } from "@amykit/agent-kit";

export type SkillsResult =
  | { ok: true; ladders: SkillLadders }
  | { ok: false; problems: string[] };

/** Where a Claude Code skill is installed, unless the config says otherwise. */
export const DEFAULT_SKILL_ROOT = "~/.claude/skills";

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
    if (!dispatchesTo(step, "agent")) {
      problems.push(`\`skills.${step}\` is not a step an agent performs: ${agentSteps().join(", ")}`);
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
