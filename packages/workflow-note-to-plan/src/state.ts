/**
 * The names a note's decisions are typed by.
 *
 * Which states exist, where a note starts, waits and ends is drawn in
 * `workflow.mmd` beside this package, and read from there when the workflow
 * mounts. This only lets the compiler hold the decisions to the same names;
 * a move the diagram does not draw fails the walkthrough.
 */
export type PlanState = "NOTED" | "DRAFTED" | "CHECKED" | "PR_OPEN" | "DONE" | "DECLINED";
