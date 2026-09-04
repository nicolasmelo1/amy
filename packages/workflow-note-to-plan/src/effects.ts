import { Plan } from "@amy/core";
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

/** Every action name this workflow can emit, as data the loader can check. */
export const USES_ACTIONS = [
  "draft-plan",
  "check-plan",
  "open-pull-request",
  "announce",
] as const;

export function act(why: string, ...effects: Effect[]): Plan {
  return { kind: "act", effects, why };
}

export function advance(to: PlanState, why: string, ...effects: Effect[]): Plan {
  return { kind: "advance", to, effects, why };
}

export function wait(retryAfterMs: number, why: string, ...effects: Effect[]): Plan {
  return { kind: "wait", retryAfterMs, why, effects };
}

export function settled(why: string): Plan {
  return { kind: "settled", why };
}
