export type PortKind = string;

export interface ActionSpec {
  /** The port that must be mounted for this action to be runnable. */
  readonly port: PortKind;
  /** The method on that port the action invokes. */
  readonly method: string;
}

/**
 * The actions the core ships.
 *
 * A workflow orders these; it does not define them. A second workflow that
 * needs `implement` reuses this one rather than declaring its own, which is
 * what stops every workflow from dragging a whole domain along with it.
 *
 * A plugin may add an action the core does not have, and when it does it has
 * to bring the port that runs it in the same package. If such an action
 * proves general it graduates to this table, by evidence rather than guess.
 */
export const CORE_ACTIONS: Readonly<Record<string, ActionSpec>> = {
  "triage": { port: "agent", method: "triage" },
  "ask-question": { port: "tracker", method: "comment" },
  "implement": { port: "agent", method: "implement" },
  "run-gate": { port: "gate", method: "run" },
  /**
   * Ask the agent for a piece of writing, in whoever asked's own words.
   *
   * The one action here that carries no vocabulary at all: a prompt goes in
   * and an account of what it cost comes back. It is dispatched to the same
   * port `triage` and `implement` are, which is what puts a second
   * workflow's agent behind the same ladder and the same ceiling as the
   * first one's without either knowing about the other.
   */
  "draft-plan": { port: "agent", method: "ask" },
  /**
   * Do the thing somebody asked for, in their own words.
   *
   * The second consumer of the generic `ask`, which is what moved it from a
   * guess to a fact: two workflows now want an agent working in a checkout
   * under a name of their own, and neither of them wants the other's. An
   * action on a port another plugin mounts has to live here rather than in
   * the workflow, because a workflow registering it would claim the `agent`
   * port out from under the relay.
   */
  "run-errand": { port: "agent", method: "ask" },
  /**
   * A workflow-declared half-step: the work reviews itself before a person
   * is asked to.
   *
   * The third consumer of the generic `ask`, and the one whose prompt is
   * entirely the workflow's own: no ticket vocabulary lives here, which is
   * what lets the brief reach it the same way it reaches every other step —
   * through the context, rather than by rebuilding the agent's prompts.
   */
  "self-review": { port: "agent", method: "ask" },
  "open-pull-request": { port: "code-host", method: "openPullRequest" },
  /**
   * An isolated checkout for one piece of work, created or reused.
   *
   * The workplace itself, as a port rather than as git knowledge every
   * workflow copies: two tickets on one repository implementing at the same
   * time is the ordinary case, and preparing one item must never repoint the
   * tree another is standing in. The branch inside the tree is still
   * `Git`'s — this action owns the tree, not the branch vocabulary.
   */
  "acquire-worktree": { port: "worktree", method: "acquire" },
  /**
   * Close one review thread, by its id.
   *
   * The write the lifecycle was missing: a state whose exit reads "no open
   * thread" could wait for a fix and be right about the code and still see
   * the conversation open, because nobody could close it. Who may close what
   * stays the workflow's policy — the port only has to make it possible.
   */
  "resolve-review-thread": { port: "code-host", method: "resolveReviewThread" },
  "address-threads": { port: "agent", method: "addressThreads" },
  "assign-reviewer": { port: "code-host", method: "requestReview" },
  "request-rereview": { port: "code-host", method: "requestReview" },
  "escalate": { port: "tracker", method: "createFollowUp" },
  "hand-off-to-qa": { port: "tracker", method: "setStatus" },
  "announce": { port: "notifier", method: "announce" },
};

/**
 * Whether one of the core's actions is dispatched to a given port.
 *
 * The engine asks this to tell an action that spends an agent from one that
 * only reads a tracker, without learning what either action means.
 */
export function dispatchesTo(action: string, port: PortKind): boolean {
  return CORE_ACTIONS[action]?.port === port;
}

export function isCoreAction(name: string): boolean {
  return Object.hasOwn(CORE_ACTIONS, name);
}
