import path from "node:path";
import yaml from "yaml";

/**
 * A plan is held to what it said.
 *
 * Grooming and execution are told apart by the paths a commit touches: a
 * grooming commit touches only plans/, delivered notes in docs/design/ and
 * the mechanism catalog, and the
 * first commit touching anything else starts execution. From then on a
 * plan's declaration moves only mechanically — to docs/design, a criterion
 * marked done, `deferred:` dropped from a proof, a source pointed at the
 * delivered note — and anything more is grooming again, which starts from
 * main rather than inside the work. See plans/a-plan-is-held-to-what-it-said.md.
 */

/** One commit of the change, in order, or the working tree after the last one. */
export interface Step {
  /** A short sha, or `the working tree`. */
  readonly id: string;
  /** Every path the step added, changed or removed; a move lists both. */
  readonly files: readonly string[];
  /** The text of each plan file the step touched, as it stands after it; undefined when removed. */
  readonly plans: ReadonlyMap<string, string | undefined>;
}

export interface HeldInput {
  readonly steps: readonly Step[];
  /** A plan file's text at the change's base, undefined when it was not there. */
  readonly atBase: (file: string) => string | undefined;
}

export interface HeldReading {
  readonly problems: string[];
  /** The file names of the plans whose declaration a grooming step of the change set. */
  readonly groomed: string[];
}

/** Whether a path is what grooming may touch. */
// A delivered note is a plan that finished: rewording its declaration is
// grooming it again, held to the same rules, never something done beside code.
function isGrooming(file: string): boolean {
  return file.startsWith("plans/") || /^docs\/design\/[^/]+\.md$/.test(file) || file === "docs/mechanisms.yaml";
}

/** Whether a path holds a plan or its delivered note. */
export function isPlan(file: string): boolean {
  return /^(plans|docs\/design)\/[^/]+\.md$/.test(file) && file !== "plans/next-steps.md";
}

export function heldProblems(input: HeldInput): HeldReading {
  const problems: string[] = [];
  const groomed = new Set<string>();
  // A plan and its delivered note are one plan: named by its file name.
  const current = new Map<string, string | undefined>();
  const known = (name: string): string | undefined => {
    if (!current.has(name)) current.set(name, declarationOf(input.atBase(`plans/${name}`) ?? input.atBase(`docs/design/${name}`)));
    return current.get(name);
  };
  let executing: string | undefined;

  for (const step of input.steps) {
    const grooming = step.files.every(isGrooming);
    const names = new Set([...step.plans.keys()].filter(isPlan).map((file) => path.basename(file)));
    for (const name of names) {
      const before = known(name);
      const after = declarationOf(step.plans.get(`plans/${name}`) ?? step.plans.get(`docs/design/${name}`));
      if (before === after) {
        current.set(name, after);
        continue;
      }
      const file = step.plans.has(`plans/${name}`) ? `plans/${name}` : `docs/design/${name}`;
      if (!grooming) {
        const code = step.files.filter((one) => !isGrooming(one)).slice(0, 3).join(", ");
        problems.push(`${step.id} changes the declaration of ${file} together with ${code}: groom a plan in a commit that touches only plans/, docs/design/ and docs/mechanisms.yaml`);
      } else if (executing) {
        problems.push(`${step.id} changes the declaration of ${file} after ${executing} started executing it: a plan in flight moves only mechanically, so groom it again from main`);
      } else {
        groomed.add(name);
      }
      current.set(name, after);
    }
    if (!grooming && executing === undefined) executing = step.id;
  }
  return { problems, groomed: [...groomed].sort() };
}

/** The declaration a plan's text opens with, or nothing when it opens with none. */
function declarationOf(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  // A note written before plans were declarations has no declaration to hold:
  // its prose moves freely, and one that loses its declaration still differs.
  if (!match) return undefined;
  try {
    return JSON.stringify(normalized(yaml.parse(match[1]!)));
  } catch {
    return match[1];
  }
}

/**
 * The declaration with what moves mechanically taken out: whether a
 * criterion is done, `deferred:` on a proof, and whether a source cites a
 * plan in plans/ or its delivered note in docs/design.
 */
function normalized(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((one) => normalized(one, key));
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([name]) => !(key === "criteria" && name === "done"))
      .map(([name, inner]) => [name, normalized(inner, name)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([name, inner]) => [name, mechanical(name, inner)]));
  }
  return value;
}

function mechanical(name: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (name === "proof") return value.replace(/\bdeferred:/g, "");
  if (name === "ref") return value.replace(/^(?:plans|docs\/design)\/([^/]+\.md)$/, "$1");
  return value;
}
