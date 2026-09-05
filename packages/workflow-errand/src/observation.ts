import { PullRequestView } from "@amykit/core";
import { Task } from "./ports/Tasks.js";

/**
 * A snapshot of the outside world for one task, gathered before deciding.
 *
 * The decision function reads nothing else, so a test can put the machine in
 * any situation by building one of these.
 */
export interface Observation {
  task: Task;
  /** Whether the task is about a repository this install works in. */
  workable: boolean;
  /**
   * Errands already in flight, across every repository.
   *
   * One pile rather than one per repository, because what is being rationed
   * is the reader's attention and they only have one.
   */
  inFlight: number;
  /** Null until the errand's branch has a pull request. */
  pullRequest: PullRequestView | null;
  now: Date;
}

export interface Policy {
  /** How many times an agent may try one errand before it is handed back. */
  maxAttempts: number;
  /**
   * How many errands this machine may have in flight at once.
   *
   * The point of `amy btw` is that capturing costs nothing, and the failure
   * that follows from that is thirty open pull requests nobody asked to
   * review. The ceiling is what keeps a cheap capture from becoming an
   * expensive pile.
   */
  maxInFlight: number;
  /** How long to hold while the ceiling is reached. */
  ceilingBackoffMs: number;
}

export const DEFAULT_POLICY: Policy = {
  maxAttempts: 2,
  maxInFlight: 3,
  ceilingBackoffMs: 30 * 60 * 1000,
};
