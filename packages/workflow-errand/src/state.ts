export const ERRAND_STATES = [
  /** Somebody said it in passing. Nothing has read it yet. */
  "QUEUED",
  /** An agent is doing it, or its last attempt needs looking at. */
  "WORKING",
  /** It changed something, so the change has to be on a pull request. */
  "PR_OPEN",
  /** Terminal: it was done, and whoever asked was told what happened. */
  "DONE",
  /**
   * Terminal: nothing was done, and the machine said why.
   *
   * A task about a repository this install does not work in, or one no
   * number of attempts got through. Neither is a failure to retry, and
   * neither should quietly look like an errand that landed.
   */
  "DECLINED",
] as const;

export type ErrandState = (typeof ERRAND_STATES)[number];

/**
 * States where the machine has nothing to do until the outside world moves.
 *
 * `QUEUED` waits only when the ceiling is reached. Nothing else in this
 * lifecycle waits on a person, which is the point of it: an errand that
 * needed a conversation would have been a ticket.
 */
export const WAITING_STATES: readonly ErrandState[] = ["QUEUED"];

export function isWaiting(state: ErrandState): boolean {
  return WAITING_STATES.includes(state);
}

export function isTerminal(state: ErrandState): boolean {
  return state === "DONE" || state === "DECLINED";
}
