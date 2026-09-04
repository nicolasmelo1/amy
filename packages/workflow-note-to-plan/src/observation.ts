import { PullRequestView } from "@amy/core";
import { Note } from "./ports/Notes.js";

/**
 * A snapshot of the outside world for one note, gathered before deciding.
 *
 * The decision function reads nothing else, so a test can put the machine in
 * any situation by building one of these.
 */
export interface Observation {
  note: Note;
  /** Whether the note is about a repository this install writes plans into. */
  writable: boolean;
  /**
   * Plans this machine is already carrying for that repository: drafted,
   * being checked, or open as a pull request nobody has read yet.
   *
   * Counted across every other note rather than per note, because the thing
   * being rationed is somebody's attention, and that is one pile.
   */
  plansInFlight: number;
  /** Null until the plan's branch has a pull request. */
  pullRequest: PullRequestView | null;
  now: Date;
}

export interface Policy {
  /** How many times an agent may try to write a plan the check accepts. */
  maxDraftAttempts: number;
  /**
   * How many plans this machine may have in flight for one repository.
   *
   * A machine that files twelve plans a day into three repositories is not
   * improving them, it is producing a backlog with a robot's name on it. The
   * same argument as the reviewer ceiling, with a different number.
   */
  maxOpenPlansPerRepo: number;
  /** How long to hold while the ceiling is reached. */
  ceilingBackoffMs: number;
}

export const DEFAULT_POLICY: Policy = {
  maxDraftAttempts: 3,
  maxOpenPlansPerRepo: 2,
  ceilingBackoffMs: 60 * 60 * 1000,
};
