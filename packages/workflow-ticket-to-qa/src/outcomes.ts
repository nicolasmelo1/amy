import { Moved, Plan, applyPlan, movedBy } from "@amykit/core";
import {
  AttemptOutcome,
  Discussion,
  Escalation,
  ThreadVerdict,
  TicketRecord,
  TriageOutcome,
} from "./record.js";
import { TicketState } from "./state.js";

/**
 * What executing a plan's actions produced.
 *
 * The engine fills in only the fields its actions actually produced, so this
 * stays honest about what happened rather than guessing.
 */
export interface EffectOutcomes {
  triage?: TriageOutcome;
  /** The conversation a triage read, when it was reading an answer. */
  clarification?: string[];
  implementation?: AttemptOutcome;
  gate?: AttemptOutcome;
  /** What the self-review said, so the record holds the latest one. */
  selfReview?: AttemptOutcome;
  pullRequestNumber?: number;
  reviewer?: string;
  verdicts?: ThreadVerdict[];
  escalation?: Escalation;
  /** Set when the owner has settled an escalation. */
  escalationResolvedAt?: string;
  /** The discussion that settled it, with the decision last. */
  escalationDecision?: string[];
  /** The turns a discussion answered this look, and the answer. */
  discussed?: Discussion;
  /** The keys of the writes this look handed to the operator. */
  handedOver?: string[];
  /** When this look said them. */
  handedOverAt?: string;
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
  if (outcomes.clarification?.length) next.clarification = outcomes.clarification;
  if (outcomes.implementation) next.lastImplementation = outcomes.implementation;
  if (outcomes.gate) next.lastGate = outcomes.gate;
  // The newest review of itself, exactly like the newest gate output: the
  // record holds what the last look said, never a running history.
  if (outcomes.selfReview) next.lastSelfReview = outcomes.selfReview;
  if (outcomes.pullRequestNumber !== undefined) {
    next.pullRequestNumber = outcomes.pullRequestNumber;
  }
  if (outcomes.reviewer) next.reviewer = outcomes.reviewer;

  mergeVerdicts(next, outcomes.verdicts);

  mergeHandedOver(next, outcomes);

  if (outcomes.escalation) next.escalation = outcomes.escalation;

  mergeDiscussion(next, outcomes.discussed);

  if (outcomes.escalationResolvedAt && next.escalation) {
    next.escalation = {
      ...next.escalation,
      resolvedAt: outcomes.escalationResolvedAt,
      ...(outcomes.escalationDecision?.length ? { decision: outcomes.escalationDecision } : {}),
    };

    // The owner's answer changes the judgement, so every comment that was
    // parked as a disagreement has to be looked at again rather than staying
    // parked forever.
    next.judged = next.judged.filter((j) => j.verdict !== "disagreed");
  }

  return next;
}

/**
 * Remembers the state an escalation interrupted, and forgets it on the way
 * back out.
 *
 * Read from the move, because the record handed to a fold has already made
 * it: its `state` is `ESCALATED` on every advance into it, and a guard written
 * against `state` excludes every escalation there is.
 *
 * Leaving `ESCALATED` also starts every retry budget again. The owner's
 * answer is new information, and a state that gave up on its attempts would
 * otherwise give up again on its very first look back.
 */
export function applyTransition(record: TicketRecord, moved: Moved | null): TicketRecord {
  if (!moved) return record;
  if (moved.to === "ESCALATED" && moved.from !== "ESCALATED") {
    return { ...record, resumeAt: moved.from as TicketState };
  }
  if (moved.from === "ESCALATED") {
    const { resumeAt: _resumed, ...rest } = record;
    return { ...rest, attempts: {}, looks: {} };
  }
  return record;
}

/** Adds the writes this look handed to the operator, and when it said them. */
function mergeHandedOver(record: TicketRecord, outcomes: EffectOutcomes): void {
  if (!outcomes.handedOver?.length) return;
  record.handedOver = [...new Set([...(record.handedOver ?? []), ...outcomes.handedOver])];
  const at = outcomes.handedOverAt;
  if (at) record.handedOverAt = { ...record.handedOverAt, ...Object.fromEntries(outcomes.handedOver.map((key) => [key, at])) };
}

/**
 * Adds what one look discussed to the wait it belongs to, and takes back the
 * attempt the look was counted as: a discussion is not work done in the
 * state, and must never be what spends a state's retries.
 */
function mergeDiscussion(record: TicketRecord, discussed: Discussion | undefined): void {
  if (!discussed) return;
  const before = record.discussion?.since === discussed.since ? record.discussion.lines : [];
  record.discussion = { since: discussed.since, upTo: discussed.upTo, lines: [...before, ...discussed.lines] };
  const counted = record.attempts[record.state] ?? 0;
  record.attempts = { ...record.attempts, [record.state]: Math.max(0, counted - 1) };
}

/** Replace a judgement by thread id, preserving unrelated prior verdicts. */
function mergeVerdicts(record: TicketRecord, verdicts: ThreadVerdict[] | undefined): void {
  for (const verdict of verdicts ?? []) {
    const existing = record.judged.findIndex((judged) => judged.threadId === verdict.threadId);
    if (existing === -1) record.judged.push(verdict);
    else record.judged[existing] = verdict;
  }
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
  return applyTransition(
    applyOutcomes(applyPlan(record, plan, now, outcomes), outcomes),
    movedBy(record, plan),
  );
}
