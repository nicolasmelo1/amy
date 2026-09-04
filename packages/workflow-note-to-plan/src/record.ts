import { WorkRecord } from "@amy/core";
import { PlanState } from "./state.js";

export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent or the check said, verbatim, for the next prompt. */
  output: string;
  at: string;
}

/**
 * Everything the machine remembers about one note, persisted between looks.
 *
 * `repo` and `slug` are copied off the note on the first look rather than
 * read from it every time, because the ceiling has to be counted across
 * *other* records without opening every note to find out what each one was
 * about.
 */
export interface PlanRecord extends WorkRecord {
  /** Narrowed from the core's plain label to this workflow's own states. */
  state: PlanState;
  /** The repository the note is about, as `owner/name`. */
  repo?: string;
  /** The name the plan file and the branch both take. */
  slug?: string;
  lastDraft?: AttemptOutcome;
  lastCheck?: AttemptOutcome;
  pullRequestNumber?: number;
}

export function newRecord(id: string, now: Date): PlanRecord {
  return {
    id,
    state: "NOTED",
    updatedAt: now.toISOString(),
    attempts: {},
    history: [],
  };
}

export function attemptsIn(record: PlanRecord, state: PlanState): number {
  return record.attempts[state] ?? 0;
}
