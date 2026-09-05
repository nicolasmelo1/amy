import { Plan } from "@amykit/core";
import { ErrandState } from "./state.js";

/**
 * This workflow's typed view of the actions it composes.
 *
 * All three are the core's own. Nothing here is new, which is the point: an
 * errand is an agent in a checkout, a pull request if it changed anything,
 * and somebody being told. Every one of those already existed.
 */
export type Effect =
  /** Do what the task says, in the repository it is about. */
  | { type: "run-errand"; finding?: string }
  | { type: "open-pull-request" }
  | { type: "announce"; text: string };

/** Every action name this workflow can emit, as data the loader can check. */
export const USES_ACTIONS = ["run-errand", "open-pull-request", "announce"] as const;

export function act(why: string, ...effects: Effect[]): Plan {
  return { kind: "act", effects, why };
}

export function advance(to: ErrandState, why: string, ...effects: Effect[]): Plan {
  return { kind: "advance", to, effects, why };
}

export function wait(retryAfterMs: number, why: string, ...effects: Effect[]): Plan {
  return { kind: "wait", retryAfterMs, why, effects };
}

export function settled(why: string): Plan {
  return { kind: "settled", why };
}
