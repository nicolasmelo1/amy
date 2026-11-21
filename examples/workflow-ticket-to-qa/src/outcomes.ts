import { Moved, Plan, applyPlan, climbFor, counted, movedBy, strictest } from "@amykit/core";
import { TicketPlan } from "./effects.js";
import { DEFAULT_POLICY, Policy } from "./observation.js";
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
  continuationContext?: string | null;
  waited?: { notATry: true; retryAfterMs: number };
  /** The repository and commit the implementation left the work at. */
  implemented?: { repo: string; revision?: string };
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
  /** The threads this look answered in words, so none is answered twice. */
  answered?: string[];
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
  applyContinuation(next, outcomes.continuationContext);
  if (outcomes.implemented) next.implemented = outcomes.implemented;
  if (outcomes.pullRequestNumber !== undefined) {
    next.pullRequestNumber = outcomes.pullRequestNumber;
  }
  if (outcomes.reviewer) next.reviewer = outcomes.reviewer;

  mergeVerdicts(next, outcomes.verdicts);

  if (outcomes.answered?.length) {
    next.answered = [...new Set([...(record.answered ?? []), ...outcomes.answered])];
  }

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

function applyContinuation(
  record: TicketRecord,
  continuation: string | null | undefined,
): void {
  if (continuation === null) delete record.continuationContext;
  else if (continuation) record.continuationContext = continuation;
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
  // A round of checks is counted where it is judged, so the ceiling on
  // rounds speaks about checks that found something, whichever lane did.
  if (moved.to === "verdict" && moved.from === "checks") {
    return { ...record, attempts: { ...record.attempts, verdict: (record.attempts.verdict ?? 0) + 1 } };
  }
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
 * than a correctness one. `policy` is the escalation the round was counted on;
 * left out, it is the one an install that named nothing runs.
 */
export function applyTicketPlan(
  record: TicketRecord,
  plan: Plan,
  outcomes: EffectOutcomes,
  now: Date,
  policy: Policy = DEFAULT_POLICY,
): TicketRecord {
  const moved = movedBy(record, plan);
  const applied = applyOutcomes(applyPlan(record, plan, now, outcomes), outcomes);
  return applyWork(applyTransition(applied, moved), record.state, plan, now, policy, outcomes.verdicts ?? []);
}

/**
 * The round one move spent, and what the move took up.
 *
 * A gate and a self-review that both refused the same commit are two origins
 * and two rounds: each is counted at its own level, and the one that escalates
 * sooner is what the next ask starts from. A review's open comments count
 * toward the review's origin, never the gate's, and the owner's word toward
 * the owner's. A move that is not a round — a first implementation, a check
 * that found nothing — counts nothing.
 *
 * A change that leaves the implementation for the checks answers every comment
 * it took up: the one it changed code for is fixed, and the one it found
 * nothing to change for is answered in the agent's own words. Either way the
 * comment is judged, so the review that raised it does not raise it again.
 *
 * The work the round was made of travels on the plan (`rounds`, `taking`,
 * `ownerWord`), so this reads the same with or without an observation to hand:
 * an engine's fold and a caller's fold write one record.
 */
export function applyWork(
  record: TicketRecord,
  from: string,
  plan: Plan,
  now: Date,
  policy: Policy = DEFAULT_POLICY,
  said: readonly ThreadVerdict[] = [],
): TicketRecord {
  const carried = plan as TicketPlan;
  if (plan.kind !== "advance") return record;
  if (plan.to === "checks") return answered(record, said);
  if (plan.to === "ESCALATED" && from !== "ESCALATED" && !record.escalation) {
    return { ...record, escalation: { reason: plan.why, askedAt: now.toISOString() } };
  }
  if (plan.to !== "IMPLEMENTING") return record;

  const rounds = carried.rounds ?? [];
  let counted = record;
  for (const one of rounds) {
    counted = countedRound(counted, one.origin, one.findings, policy);
  }
  const climbs = rounds.map((one) => climbFor(policy.escalation, counted, one.origin, one.findings));
  const worst = strictest(climbs);
  return {
    ...counted,
    ...(carried.taking?.length ? { taking: [...carried.taking] } : {}),
    ...(carried.ownerWord ? { ownerWord: carried.ownerWord } : {}),
    ...(worst ? { lastOrigin: worst.origin } : {}),
  };
}

/** One origin's round, counted on the record. */
function countedRound(record: TicketRecord, origin: string, findings: number, policy: Policy): TicketRecord {
  return counted(record, climbFor(policy.escalation, record, origin, findings));
}

/**
 * The change answers every thread it took up.
 *
 * A step that read the threads may have said something else about one — that it
 * is out of the brief's scope, or that it undoes the brief — and what it said is
 * what the record keeps: the machine does not overrule the reader of the code.
 */
function answered(record: TicketRecord, said: readonly ThreadVerdict[]): TicketRecord {
  if (!record.taking?.length) return record;
  const progress = record.lastImplementation?.progress;
  // What the step said wins, whether it came with this fold's outcomes or was
  // already written on the record by them; the machine's own reading is the
  // last word only for a thread nobody spoke about.
  const spoken = new Map([...record.judged, ...said].map((one) => [one.threadId, one]));
  const answers = record.taking.map((threadId): ThreadVerdict => {
    const voice = spoken.get(threadId);
    if (voice) return voice;
    return progress?.kind === "unchanged"
      ? { threadId, verdict: "answered", note: progress.detail }
      : { threadId, verdict: "fixed", note: "the change answers it" };
  });
  const { taking: _done, ...rest } = record;
  return { ...rest, judged: mergeJudged(rest.judged, answers) };
}

/** The record's judgements with these answers in them, one per thread. */
function mergeJudged(judged: readonly ThreadVerdict[], answers: readonly ThreadVerdict[]): ThreadVerdict[] {
  const next = [...judged];
  for (const answer of answers) {
    const at = next.findIndex((one) => one.threadId === answer.threadId);
    if (at === -1) next.push(answer);
    else next[at] = answer;
  }
  return next;
}
