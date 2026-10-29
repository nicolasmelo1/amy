import { planning } from "@amykit/core";
import { PlanState } from "./state.js";

/**
 * This workflow's typed view of the actions it composes.
 *
 * Two of the four are the core's own and are shared with the ticket
 * workflow — a pull request is a pull request, and telling the operator
 * something is telling the operator something. `draft-plan` is the core's as
 * well, and carries no vocabulary at all. Only `check-plan` is new, and the
 * plugin that runs it brings it along with its port.
 */
export type Effect =
  /** Write the plan and its line in the ordered list. */
  | { type: "draft-plan"; finding?: string }
  /** Run the repository's own `sf check` over what was written. */
  | { type: "check-plan" }
  | { type: "open-pull-request" }
  | { type: "announce"; text: string };

export const { act, advance, wait, settled } = planning<PlanState, Effect>();
