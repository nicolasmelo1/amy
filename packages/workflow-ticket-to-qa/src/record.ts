import { AttemptOutcome, WorkRecord } from "@amykit/core";
import { ThreadVerdict, TriageOutcome } from "./agent-steps.js";
import { TicketState } from "./state.js";

// Re-exported so the record's fields mean the same thing to every consumer:
// the attempt from the core, the triage and verdicts from this workflow.
export type { AttemptOutcome, ThreadVerdict, TriageOutcome };

export interface Escalation {
  reason: string;
  askedAt: string;
  followUpTicketId?: string;
  resolvedAt?: string;
  /**
   * The discussion that settled it, attributed, with the decision last — what
   * the step it resumes is prompted with, so the agent acts on what was
   * concluded rather than on the first thing said.
   */
  decision?: string[];
}

/**
 * What has been discussed during one wait, and answered.
 *
 * Keyed by the instant the wait began — the question asked, the escalation
 * raised — so a new wait starts a new discussion rather than inheriting one.
 */
export interface Discussion {
  since: string;
  /** The newest turn answered; a turn at or before it is not asked again. */
  upTo: string;
  /** Each turn and each answer, attributed, oldest first. */
  lines: string[];
}

/**
 * Everything the machine remembers about one ticket, persisted between looks.
 *
 * Outcomes live here rather than being returned from the decision function,
 * because the work that produces them takes far longer than one look and has
 * to survive a crash.
 */
export interface TicketRecord extends WorkRecord {
  /** Narrowed from the core's plain label to this workflow's own states. */
  state: TicketState;
  triage?: TriageOutcome;
  /**
   * What the questions before the work were answered with, and what was
   * discussed on the way — the conversation the triage read when it cleared,
   * kept so the implementation is told it too.
   */
  clarification?: string[];
  lastImplementation?: AttemptOutcome;
  /**
   * Where the last implementation left the work: its repository and the
   * commit, which both checks are lent read-only rather than the base.
   */
  implemented?: { repo: string; revision: string };
  /** What the gate lane said about the last commit it checked. */
  lastGate?: AttemptOutcome;
  /**
   * What the work's own review of itself last said, against the brief, and
   * whether it asked for changes: the self-review lane's half of the verdict.
   */
  lastSelfReview?: AttemptOutcome & { verdict?: "APPROVED" | "CHANGES_ASKED" };
  pullRequestNumber?: number;
  reviewer?: string;
  /** Threads already judged, so the same comment is never worked twice. */
  judged: ThreadVerdict[];
  escalation?: Escalation;
  /** The discussion in the current wait, when anybody started one. */
  discussion?: Discussion;
  /**
   * The state an escalation interrupted, so the owner's answer sends the work
   * back there rather than to wherever the machine happens to resume.
   *
   * Folded from the transition, never from `state`: by the time the fold
   * runs, `state` is already `ESCALATED` on every move into it.
   */
  resumeAt?: TicketState;
  /**
   * The writes already handed to the operator, by key, so each one is said
   * once and the looks after it wait for its effect instead of saying it
   * again.
   */
  handedOver?: string[];
  /**
   * When each of those was said, by key. A review the operator was asked to
   * request counts only if it was requested, or submitted, after this: a
   * review already on the head from the round before is not an answer.
   */
  handedOverAt?: Record<string, string>;
}

export function judgedThreadIds(record: TicketRecord): string[] {
  return record.judged.map((j) => j.threadId);
}

export function disagreements(record: TicketRecord): ThreadVerdict[] {
  return record.judged.filter((j) => j.verdict === "disagreed");
}
