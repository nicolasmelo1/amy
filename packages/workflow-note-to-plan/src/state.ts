export const PLAN_STATES = [
  /** Somebody, or something, wrote the friction down. Nothing read it yet. */
  "NOTED",
  /** An agent is writing the plan, or its last attempt needs checking. */
  "DRAFTED",
  /** A draft exists, and the repository's own `sf check` decides if it holds. */
  "CHECKED",
  /** The check is green, the pull request has to exist. */
  "PR_OPEN",
  /** Terminal: the plan is on a pull request, and a human decides from here. */
  "DONE",
  /**
   * Terminal: the machine wrote nothing, and said why.
   *
   * A note about a repository this install does not write into, or a draft no
   * number of attempts could get past the check. Neither is a failure to
   * retry, and neither should quietly look like a plan that landed.
   */
  "DECLINED",
] as const;

export type PlanState = (typeof PLAN_STATES)[number];

/**
 * States where the machine has nothing to do until the outside world moves.
 *
 * Only one, and that is the point of this lifecycle: nothing in it waits on a
 * person except the pull request at the end, which is somebody else's to
 * merge and is terminal here. `NOTED` waits only when the ceiling is reached.
 */
export const WAITING_STATES: readonly PlanState[] = ["NOTED"];

export function isWaiting(state: PlanState): boolean {
  return WAITING_STATES.includes(state);
}

export function isTerminal(state: PlanState): boolean {
  return state === "DONE" || state === "DECLINED";
}
