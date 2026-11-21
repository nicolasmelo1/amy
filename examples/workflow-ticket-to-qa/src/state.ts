/**
 * The names a ticket's decisions are typed by.
 *
 * Which states exist, where a ticket starts, waits and ends is drawn in
 * `workflow.mmd` beside this package, and read from there when the workflow
 * mounts. This only lets the compiler hold the decisions to the same names;
 * a move the diagram does not draw fails the walkthrough.
 */
export type TicketState = DecidedState | "checks" | LegacyFixState;

/**
 * The two states the review loop used to change code in, removed with no
 * legacy path: nothing decides in them any more, and a record saved in one is
 * refused when it is loaded. They are still named here because an older
 * record on disk holds one, and reading that record is what the refusal is.
 */
export type LegacyFixState = "COPILOT_FIX" | "HUMAN_FIX";

/** Every state this workflow decides. `checks` is the fork the gate and the
 * self-review run from, and its lanes move it; `verdict`, where they meet,
 * is where the decision is. */
export type DecidedState =
  | "DISCOVERED"
  | "CLARIFYING"
  | "READY"
  | "IMPLEMENTING"
  | "verdict"
  | "PR_OPEN"
  | "COPILOT_WAIT"
  | "REVIEWER_ASSIGNED"
  | "HUMAN_REVIEW"
  | "ESCALATED"
  | "RE_REVIEW"
  | "APPROVED"
  | "QA_HANDOFF"
  | "DONE";
