import { Plan } from "@amy/core";
import { TicketState } from "./state.js";

/**
 * This workflow's typed view of the actions it composes.
 *
 * The core owns the catalogue of action names and how each one is dispatched.
 * What lives here is the payload each one carries in *this* workflow, which
 * is what lets the decision function stay type-checked while the core stays
 * ignorant of tickets, reviewers and pull requests.
 */
export type Effect =
  /** Read the ticket and decide whether it can be implemented as written. */
  | { type: "triage" }
  | { type: "ask-question"; questions: string[] }
  | { type: "implement"; retryContext?: string }
  | { type: "run-gate" }
  | { type: "open-pull-request" }
  | { type: "address-threads"; threadIds: string[]; from: "automated" | "human" }
  | { type: "assign-reviewer"; host: string }
  | { type: "request-rereview"; host: string }
  | { type: "escalate"; reason: string; threadIds: string[] }
  | { type: "hand-off-to-qa"; tracker: string }
  | { type: "announce"; text: string };

/** Every action name this workflow can emit, as data the loader can check. */
export const USES_ACTIONS = [
  "triage",
  "ask-question",
  "implement",
  "run-gate",
  "open-pull-request",
  "address-threads",
  "assign-reviewer",
  "request-rereview",
  "escalate",
  "hand-off-to-qa",
  "announce",
] as const;

export function act(why: string, ...effects: Effect[]): Plan {
  return { kind: "act", effects, why };
}

export function advance(to: TicketState, why: string, ...effects: Effect[]): Plan {
  return { kind: "advance", to, effects, why };
}

export function wait(retryAfterMs: number, why: string, ...effects: Effect[]): Plan {
  return { kind: "wait", retryAfterMs, why, effects };
}

export function settled(why: string): Plan {
  return { kind: "settled", why };
}
