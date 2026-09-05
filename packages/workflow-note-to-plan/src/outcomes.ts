import { Plan, applyPlan } from "@amykit/core";
import { AttemptOutcome, PlanRecord } from "./record.js";

/**
 * What executing a plan's actions produced.
 *
 * Only the fields its actions actually produced are filled in, so this stays
 * honest about what happened rather than guessing.
 */
export interface EffectOutcomes {
  draft?: AttemptOutcome;
  check?: AttemptOutcome;
  pullRequestNumber?: number;
  /** Copied off the note on the first look, so the ceiling can be counted. */
  repo?: string;
  slug?: string;
}

/**
 * Folds this workflow's own outcomes into a record.
 *
 * The core folds the state, the attempt count and the history; it cannot fold
 * these, because it does not know what a draft or a check result is. Pure,
 * and the only place a plan record changes shape.
 */
export function applyOutcomes(record: PlanRecord, outcomes: EffectOutcomes): PlanRecord {
  const next: PlanRecord = { ...record };

  if (outcomes.repo) next.repo = outcomes.repo;
  if (outcomes.slug) next.slug = outcomes.slug;
  if (outcomes.draft) next.lastDraft = outcomes.draft;
  if (outcomes.check) next.lastCheck = outcomes.check;
  if (outcomes.pullRequestNumber !== undefined) {
    next.pullRequestNumber = outcomes.pullRequestNumber;
  }

  return next;
}

/** The whole fold for one look: the core's half, then this workflow's. */
export function applyNotePlan(
  record: PlanRecord,
  plan: Plan,
  outcomes: EffectOutcomes,
  now: Date,
): PlanRecord {
  return applyOutcomes(applyPlan(record, plan, now), outcomes);
}
