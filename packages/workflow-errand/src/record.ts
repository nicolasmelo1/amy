import { WorkRecord } from "@amy/core";
import { ErrandState } from "./state.js";

export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent said, verbatim, for the next prompt or the report. */
  output: string;
  at: string;
}

/**
 * Everything the machine remembers about one task, between looks.
 *
 * `repo` and `slug` are copied off the task on the first look rather than
 * read from it every time, because the ceiling is counted across *other*
 * records without opening every task to find out what each one was about.
 */
export interface ErrandRecord extends WorkRecord {
  /** Narrowed from the core's plain label to this workflow's own states. */
  state: ErrandState;
  repo?: string;
  /** The name the branch takes. */
  slug?: string;
  lastAttempt?: AttemptOutcome;
  /**
   * Whether the last attempt left a change on a branch.
   *
   * False is a real answer rather than a failure: "check whether the monitor
   * is still firing" is an errand that ends in a sentence, not a diff.
   */
  changed?: boolean;
  pullRequestNumber?: number;
}

export function newRecord(id: string, now: Date): ErrandRecord {
  return { id, state: "QUEUED", updatedAt: now.toISOString(), attempts: {}, history: [] };
}

export function attemptsIn(record: ErrandRecord, state: ErrandState): number {
  return record.attempts[state] ?? 0;
}
