import { WorkRecord } from "@amykit/core";
import { TicketState } from "./state.js";

export interface TriageOutcome {
  /** True when the ticket can be implemented as written. */
  clear: boolean;
  questions: string[];
  at: string;
}

export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent or the gate said, verbatim, for the next prompt. */
  output: string;
  at: string;
}

export interface ThreadVerdict {
  threadId: string;
  /** `fixed` means the code changed. `disagreed` means it needs the owner. */
  verdict: "fixed" | "disagreed";
  note: string;
}

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
  pullRequestNumber?: number;
  reviewer?: string;
  /** Threads already judged, so the same comment is never worked twice. */
  judged: ThreadVerdict[];
  escalation?: Escalation;
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
