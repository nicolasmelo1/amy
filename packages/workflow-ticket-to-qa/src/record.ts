import { WorkRecord } from "@amykit/core";
import {
  AttemptOutcome,
  ThreadVerdict,
  TriageOutcome,
} from "@amykit/core";
import { TicketState } from "./state.js";

// The outcome contracts moved to the core beside the ports that carry them;
// re-exported here so the workflow's own consumers keep compiling, and so
// the record's fields keep meaning the same thing everywhere.
export type { AttemptOutcome, ThreadVerdict, TriageOutcome };

export interface Escalation {
  reason: string;
  askedAt: string;
  followUpTicketId?: string;
  resolvedAt?: string;
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
  lastImplementation?: AttemptOutcome;
  lastGate?: AttemptOutcome;
  /**
   * What the work's own review of itself last said, against the brief.
   *
   * Held for the operator and the record's reader, not for the machine: the
   * plan reads the state, and this says what the last look at the change
   * actually found — the same relationship `lastGate` has to `CHECKED`.
   */
  lastSelfReview?: AttemptOutcome;
  pullRequestNumber?: number;
  reviewer?: string;
  /** Threads already judged, so the same comment is never worked twice. */
  judged: ThreadVerdict[];
  escalation?: Escalation;
  /**
   * The state an escalation interrupted, so the owner's answer sends the work
   * back there rather than to wherever the machine happens to resume.
   *
   * Folded from the transition, never from `state`: by the time the fold
   * runs, `state` is already `ESCALATED` on every move into it.
   */
  resumeAt?: TicketState;
}

export function newRecord(id: string, now: Date): TicketRecord {
  return {
    id,
    state: "DISCOVERED",
    updatedAt: now.toISOString(),
    attempts: {},
    judged: [],
    history: [],
  };
}

export function attemptsIn(record: TicketRecord, state: TicketState): number {
  return record.attempts[state] ?? 0;
}

export function judgedThreadIds(record: TicketRecord): string[] {
  return record.judged.map((j) => j.threadId);
}

export function disagreements(record: TicketRecord): ThreadVerdict[] {
  return record.judged.filter((j) => j.verdict === "disagreed");
}
