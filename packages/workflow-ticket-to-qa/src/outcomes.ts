import { Plan, applyPlan } from "@amy/core";
import {
  AttemptOutcome,
  Escalation,
  ThreadVerdict,
  TicketRecord,
  TriageOutcome,
} from "./record.js";

/**
 * What executing a plan's actions produced.
 *
 * The engine fills in only the fields its actions actually produced, so this
 * stays honest about what happened rather than guessing.
 */
export interface EffectOutcomes {
  triage?: TriageOutcome;
  implementation?: AttemptOutcome;
  gate?: AttemptOutcome;
  pullRequestNumber?: number;
  reviewer?: string;
  verdicts?: ThreadVerdict[];
  escalation?: Escalation;
  /** Set when the owner has settled an escalation. */
  escalationResolvedAt?: string;
}

/**
 * Folds this workflow's own outcomes into a record.
 *
 * The core folds the state, the attempt count and the history; it cannot fold
 * these, because it does not know what a triage or a gate result is. Pure,
 * and the only place a ticket record changes shape, so the rules that stop
 * the machine looping live in one readable function.
 */
export function applyOutcomes(record: TicketRecord, outcomes: EffectOutcomes): TicketRecord {
  const next: TicketRecord = { ...record, judged: [...record.judged] };

  if (outcomes.triage) next.triage = outcomes.triage;
  if (outcomes.implementation) next.lastImplementation = outcomes.implementation;
  if (outcomes.gate) next.lastGate = outcomes.gate;
  if (outcomes.pullRequestNumber !== undefined) {
    next.pullRequestNumber = outcomes.pullRequestNumber;
  }
  if (outcomes.reviewer) next.reviewer = outcomes.reviewer;

  if (outcomes.verdicts) {
    for (const verdict of outcomes.verdicts) {
      const existing = next.judged.findIndex((j) => j.threadId === verdict.threadId);
      if (existing === -1) {
        next.judged.push(verdict);
      } else {
        next.judged[existing] = verdict;
      }
    }
  }

  if (outcomes.escalation) next.escalation = outcomes.escalation;

  if (outcomes.escalationResolvedAt && next.escalation) {
    next.escalation = { ...next.escalation, resolvedAt: outcomes.escalationResolvedAt };

    // The owner's answer changes the judgement, so every comment that was
    // parked as a disagreement has to be looked at again rather than staying
    // parked forever.
    next.judged = next.judged.filter((j) => j.verdict !== "disagreed");
  }

  return next;
}

/**
 * The whole fold for one look: what the core knows how to do, then what only
 * this workflow knows how to do.
 *
 * The two touch disjoint fields, so the order is a readability choice rather
 * than a correctness one.
 */
export function applyTicketPlan(
  record: TicketRecord,
  plan: Plan,
  outcomes: EffectOutcomes,
  now: Date,
): TicketRecord {
  return applyOutcomes(applyPlan(record, plan, now), outcomes);
}
