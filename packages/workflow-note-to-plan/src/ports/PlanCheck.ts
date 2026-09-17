import { AttemptOutcome } from "../record.js";

/**
 * The quality bar, which is the repository's own.
 *
 * A plan with no exit condition, or one missing from the ordered list, is
 * refused by the repository a contributor would meet, rather than by a rubric
 * this machine invented for itself. Its output is kept verbatim, because it
 * becomes the finding the agent is sent back with.
 */
export interface PlanCheck {
  /**
   * Runs the check in the work's own tree, when one was isolated for it.
   *
   * The work id is the second half of the address: without a worktree port
   * behind the host's Git it is unused, and the check runs in the shared
   * checkout exactly as it always did.
   */
  check(repo: string, workId?: string): Promise<AttemptOutcome>;
}
