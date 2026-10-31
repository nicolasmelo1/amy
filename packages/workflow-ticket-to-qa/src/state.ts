/**
 * The names a ticket's decisions are typed by.
 *
 * Which states exist, where a ticket starts, waits and ends is drawn in
 * `workflow.mmd` beside this package, and read from there when the workflow
 * mounts. This only lets the compiler hold the decisions to the same names;
 * a move the diagram does not draw fails the walkthrough.
 */
export type TicketState = DecidedState | "checks";

/**
 * Every state this workflow decides. `checks` is the fork the gate and the
 * self-review run from, and its lanes move it; `verdict`, where they meet,
 * is where the decision is.
 */
export type DecidedState =
  | "DISCOVERED"
  | "CLARIFYING"
  | "READY"
  | "IMPLEMENTING"
  | "verdict"
  | "PR_OPEN"
  | "COPILOT_WAIT"
  | "COPILOT_FIX"
  | "REVIEWER_ASSIGNED"
  | "HUMAN_REVIEW"
  | "HUMAN_FIX"
  | "ESCALATED"
  | "RE_REVIEW"
  | "APPROVED"
  | "QA_HANDOFF"
  | "DONE";
