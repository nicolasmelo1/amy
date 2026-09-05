import { Plan, applyPlan } from "@amy/core";
import { Observation } from "./observation.js";
import { AttemptOutcome, ErrandRecord } from "./record.js";

/** What this workflow's handlers leave behind for its own fold to read. */
export interface EffectOutcomes {
  attempt?: AttemptOutcome;
  changed?: boolean;
  pullRequestNumber?: number;
}

/**
 * Folds what the actions produced into the record.
 *
 * The engine has already folded the state, the attempt count and the history.
 * It cannot fold this, because it does not know what an attempt is.
 */
export function applyOutcomes(
  record: ErrandRecord,
  outcomes: EffectOutcomes,
  observation: Observation,
): ErrandRecord {
  return {
    ...record,
    repo: record.repo ?? observation.task.repo,
    ...(outcomes.attempt ? { lastAttempt: outcomes.attempt } : {}),
    ...(outcomes.changed === undefined ? {} : { changed: outcomes.changed }),
    ...(outcomes.pullRequestNumber === undefined
      ? {}
      : { pullRequestNumber: outcomes.pullRequestNumber }),
  };
}

/** The engine's fold and this workflow's, in the order they have to happen. */
export function applyErrandPlan(
  record: ErrandRecord,
  plan: Plan,
  outcomes: EffectOutcomes,
  observation: Observation,
  now: Date,
): ErrandRecord {
  return applyOutcomes(applyPlan(record, plan, now), outcomes, observation);
}
