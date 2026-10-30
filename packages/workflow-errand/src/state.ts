/**
 * The names an errand's decisions are typed by.
 *
 * Which states exist, where an errand starts, waits and ends is drawn in
 * `workflow.mmd` beside this package, and read from there when the workflow
 * mounts. This only lets the compiler hold the decisions to the same names;
 * a move the diagram does not draw fails the walkthrough.
 */
export type ErrandState = "QUEUED" | "WORKING" | "PR_OPEN" | "DONE" | "DECLINED";
