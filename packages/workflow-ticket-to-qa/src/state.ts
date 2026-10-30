/**
 * The names a ticket's decisions are typed by.
 *
 * Which states exist, where a ticket starts, waits and ends is drawn in
 * `workflow.mmd` beside this package, and read from there when the workflow
 * mounts. This only lets the compiler hold the decisions to the same names;
 * a move the diagram does not draw fails the walkthrough.
 */
export type TicketState =
  | "DISCOVERED"
  | "CLARIFYING"
  | "READY"
  | "IMPLEMENTING"
  | "CHECKED"
  | "SELF_REVIEW"
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
