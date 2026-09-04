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
  check(repo: string): Promise<AttemptOutcome>;
}
