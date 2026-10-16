import { Plan } from "@amykit/core";
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
  | { type: "triage"; conversation?: string[] }
  | { type: "ask-question"; questions: string[] }
  | { type: "implement"; retryContext?: string }
  | { type: "run-gate" }
  | { type: "self-review" }
  | { type: "open-pull-request" }
  | { type: "resolve-review-thread"; threadId: string }
  | { type: "address-threads"; threadIds: string[]; from: "automated" | "human" }
  | { type: "assign-reviewer"; host: string }
  | { type: "request-rereview"; host: string }
  | { type: "escalate"; reason: string; threadIds: string[] }
  | { type: "hand-off-to-qa"; tracker: string }
  | { type: "announce"; text: string }
  /**
   * Writes handed to the operator instead of made, said in one message. Each
   * turn carries the write it stands for, so the runtime can say exactly
   * what to do, and a key, so the machine says each one once.
   */
  | { type: "hand-over"; turns: HandOverTurn[] };

/** The writes this workflow makes on the tracker or the code host. */
export type WriteEffect = Extract<
  Effect,
  {
    type:
      | "ask-question"
      | "escalate"
      | "open-pull-request"
      | "resolve-review-thread"
      | "assign-reviewer"
      | "request-rereview"
      | "hand-off-to-qa";
  }
>;

export interface HandOverTurn {
  key: string;
  write: WriteEffect;
}

export const WRITE_EFFECTS: readonly WriteEffect["type"][] = [
  "ask-question",
  "escalate",
  "open-pull-request",
  "resolve-review-thread",
  "assign-reviewer",
  "request-rereview",
  "hand-off-to-qa",
];

export function isWrite(effect: Effect): effect is WriteEffect {
  return (WRITE_EFFECTS as readonly string[]).includes(effect.type);
}

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
