import { AttemptOutcome } from "./Agent.js";

/** Where one piece of work happens: its repository, and its own tree in it. */
export interface Workplace {
  repo: string;
  workId: string;
}

/**
 * The gate: the check that decides whether an implementation holds, before
 * anything is published for a person to read.
 *
 * What the answer means is a workflow's to weigh, but what a gate *is*
 * belongs below every workflow, so a second workflow's own check slots into
 * the same seam. It takes the workplace rather than the work: a gate needs a
 * directory, and any kind of work has one.
 */
export interface Gate {
  /**
   * Runs the gate in the work's own tree, and says what happened.
   *
   * `ok` is the verdict; `output` is the evidence, verbatim, so a retry can
   * be handed the reason it is retrying rather than a summary of it.
   */
  run(workplace: Workplace): Promise<AttemptOutcome>;
}
