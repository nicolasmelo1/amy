import { planning } from "@amykit/core";
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
  | { type: "implement"; retryContext?: string; conversation?: string[]; discussion?: string[] }
  | { type: "run-gate" }
  | { type: "self-review" }
  | { type: "open-pull-request" }
  | { type: "resolve-review-thread"; threadId: string }
  | { type: "address-threads"; threadIds: string[]; from: "automated" | "human"; discussion?: string[] }
  /**
   * Answer the turns somebody took in the work's thread while it waits, and
   * nothing else: no state, no commit, no attempt. `since` names the wait
   * the turns belong to, and `thread` is what was said in it before them.
   */
  | {
      type: "discuss";
      since: string;
      about: string;
      thread: string[];
      turns: DiscussionTurn[];
      /** What the questions before the work settled, so it is not argued again. */
      clarification?: string[];
      /** The review threads an escalated disagreement is about, read from the pull request. */
      threadIds?: string[];
    }
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

/** One turn a person took in a discussion, attributed. */
export interface DiscussionTurn {
  at: string;
  author: string;
  text: string;
}

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

export const { act, advance, wait, settled } = planning<TicketState, Effect>();
