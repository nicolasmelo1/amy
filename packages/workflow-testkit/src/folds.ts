import { Plan, WorkRecord } from "@amykit/core";
import { Finding } from "./finding.js";
import { describe, replay, sameDecision } from "./plans.js";
import { AnyWorkflow, Look, Walk } from "./walk.js";

/**
 * Nothing is concluded from an empty collection.
 *
 * `[].every(...)` is `true`, so a ticket with no repositories reads as
 * approved in all of them and gets merged in every one. The probe replays
 * each look with each collection it can find emptied, and asks whether the
 * decision rested on an `every` that had nothing to check: the same look is
 * decided twice, once with an empty `every` answering `true` as the language
 * does and once answering `false`, and a decision that changes between the
 * two was made by the vacuous truth rather than by the work.
 *
 * `!list.some(...)` is left alone on purpose. "None of them is open" is a
 * sentence that means something of none; "all of them are approved" is one
 * nobody means of none, and `every` is how that sentence is written.
 */
export function folds(workflow: AnyWorkflow, walks: readonly Walk[]): Finding[] {
  const findings: Finding[] = [];
  const reported = new Set<string>();

  for (const walk of walks) {
    const policy = walk.runtime?.policy;
    for (const look of walk.looks) {
      for (const variant of variantsOf(look)) {
        const decide = (): Plan => workflow.plan(variant.record, variant.observation, policy);
        const vacuous = decideWithEvery(true, decide);
        if (!vacuous.plan || !vacuous.asked) continue;
        const otherwise = decideWithEvery(false, decide);
        if (!otherwise.plan || sameDecision(vacuous.plan, otherwise.plan)) continue;

        const key = `${look.record.state}\u0000${variant.emptied}`;
        if (reported.has(key)) continue;
        reported.add(key);
        findings.push({
          property: "folds",
          message:
            `${walk.world}: in \`${look.record.state}\`, with ${variant.emptied}, the decision to ${describe(vacuous.plan)} ` +
            `rests on \`[].every(...)\` being true. Had there been anything to check it could have been ` +
            `${describe(otherwise.plan)}; say what an empty collection means instead of letting \`every\` say it`,
        });
      }
    }
  }
  return findings;
}

interface Variant {
  readonly record: WorkRecord;
  readonly observation: unknown;
  /** How the finding names what was emptied. */
  readonly emptied: string;
}

function variantsOf(look: Look): Variant[] {
  const variants: Variant[] = [{ record: look.record, observation: look.observation, emptied: "the collections as observed" }];
  const paths: string[][] = [];
  collections({ record: look.record, observation: look.observation }, [], paths, new WeakSet());

  // Every collection, however deep and however many: a cap here would be a
  // collection the probe silently never emptied, and a green suite that
  // did not look.
  for (const path of paths) {
    const root = emptiedAt({ record: look.record, observation: look.observation }, path) as {
      record: WorkRecord;
      observation: unknown;
    };
    variants.push({ ...root, emptied: `\`${path.join(".")}\` empty` });
  }
  return variants;
}

/**
 * Every non-empty array reachable through plain objects and arrays.
 *
 * Walked to the bottom, with a record of what has been entered so an
 * observation that refers back to itself is visited once rather than forever.
 */
function collections(value: unknown, path: string[], out: string[][], entered: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || entered.has(value)) return;
  if (Array.isArray(value)) {
    entered.add(value);
    if (value.length > 0 && path.length > 0) out.push(path);
    value.forEach((item, index) => collections(item, [...path, String(index)], out, entered));
    return;
  }
  if (!isPlain(value)) return;
  entered.add(value);
  for (const [key, item] of Object.entries(value)) collections(item, [...path, key], out, entered);
}

function emptiedAt(value: unknown, path: readonly string[]): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item, index) => (String(index) === head ? emptiedAt(item, rest) : item));
  }
  return { ...(value as Record<string, unknown>), [head]: emptiedAt((value as Record<string, unknown>)[head], rest) };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Decides once with an empty `every` answering as told, and says whether any
 * `every` was asked of an empty array while deciding.
 *
 * The one place the kit reaches into the language: `plan` is synchronous and
 * pure, so for the length of one call nothing but `plan` runs, and whatever
 * `every` was in place — the language's, or somebody else's patch — is read
 * at the call and put back before it returns or throws.
 */
function decideWithEvery(answer: boolean, decide: () => Plan): { plan: Plan | undefined; asked: boolean } {
  const every = Array.prototype.every;
  let asked = false;
  const counted = function (this: unknown[], ...args: Parameters<typeof every>): boolean {
    if (this.length === 0) {
      asked = true;
      return answer;
    }
    return every.apply(this, args);
  };
  Array.prototype.every = counted as typeof every;
  try {
    const plan = replay(decide);
    return { plan, asked };
  } finally {
    Array.prototype.every = every;
  }
}
