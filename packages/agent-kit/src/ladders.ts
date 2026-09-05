import { Rung } from "./ladder.js";

/**
 * Which rungs answer for a step, and which answer for everything else.
 *
 * One ladder for the whole install is the right default and the wrong ceiling.
 * Reading a ticket to decide whether it is clear enough to start is not the
 * same job as writing the change, and putting both behind one list means
 * paying the expensive model to do the cheap step, or asking the cheap one to
 * do the work.
 *
 * So the ladder is per step, with a default, and the step is the action's own
 * name — which the relay already had in hand for choosing a skill. That is
 * also what makes routing by difficulty possible without anything here
 * learning the word: a workflow that triages into easy and hard emits
 * different actions for each, and the config points them at different rungs.
 */
export interface Ladders<T extends Rung> {
  /** Used by any step that names no ladder of its own. */
  readonly fallback: readonly T[];
  readonly byStep: Readonly<Record<string, readonly T[]>>;
}

/** One ladder for everything, which is what an install starts with. */
export function oneLadder<T extends Rung>(rungs: readonly T[]): Ladders<T> {
  return { fallback: rungs, byStep: {} };
}

/**
 * The rungs for a step, or the fallback.
 *
 * A step with an empty ladder falls back rather than failing: an operator who
 * writes `triage: []` has said nothing about triage, and the alternative is a
 * relay with nowhere to go, which the constructor already refuses to be.
 */
export function rungsFor<T extends Rung>(ladders: Ladders<T>, step?: string): readonly T[] {
  const named = step ? ladders.byStep[step] : undefined;
  return named && named.length > 0 ? named : ladders.fallback;
}

/** Every rung any step could reach, for a caller that has to check them all. */
export function everyRung<T extends Rung>(ladders: Ladders<T>): readonly T[] {
  return [...ladders.fallback, ...Object.values(ladders.byStep).flat()];
}
