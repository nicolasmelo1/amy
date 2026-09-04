export const TICKET_STATES = [
  /** Picked up from the tracker, not yet read. */
  "DISCOVERED",
  /** A blocking question is on the ticket, waiting for a human answer. */
  "CLARIFYING",
  /** Understood and unambiguous, nothing written yet. */
  "READY",
  /** An agent is implementing, or its last attempt needs judging. */
  "IMPLEMENTING",
  /** Implementation exists, the deterministic gate decides if it holds. */
  "CHECKED",
  /** Gate is green, the pull request has to exist. */
  "PR_OPEN",
  /** Waiting for the automated reviewer to look at the current head. */
  "COPILOT_WAIT",
  /** The automated reviewer left unresolved threads. */
  "COPILOT_FIX",
  /** Nothing automated is outstanding, a human reviewer has to be picked. */
  "REVIEWER_ASSIGNED",
  /** Waiting for the assigned human to review the current head. */
  "HUMAN_REVIEW",
  /** The human left unresolved threads. */
  "HUMAN_FIX",
  /** Something needs the ticket owner, so the machine holds. */
  "ESCALATED",
  /** Fixes are pushed, review has to be requested again. */
  "RE_REVIEW",
  /** A human approved the current head. */
  "APPROVED",
  /** Approved, the ticket has to move to QA. */
  "QA_HANDOFF",
  /** Terminal. */
  "DONE",
] as const;

export type TicketState = (typeof TICKET_STATES)[number];

/**
 * States where the machine has nothing to do until the outside world moves.
 * Kept explicit so the runner can back off instead of spinning, and so a new
 * state cannot silently become a busy loop.
 */
export const WAITING_STATES: readonly TicketState[] = [
  "CLARIFYING",
  "COPILOT_WAIT",
  "HUMAN_REVIEW",
  "ESCALATED",
];

export function isWaiting(state: TicketState): boolean {
  return WAITING_STATES.includes(state);
}

export function isTerminal(state: TicketState): boolean {
  return state === "DONE";
}
