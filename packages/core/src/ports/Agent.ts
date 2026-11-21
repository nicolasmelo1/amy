import { AskContext, HarnessReply } from "./Harness.js";

/** A run a workflow can continue from, or one that adds no evidence. */
export type Progress =
  | { kind: "advanced"; key: string }
  | { kind: "unchanged"; key: string; detail: string }
  | { kind: "handoff"; detail: string };

/** What one attempt to write the change produced, gate included. */
export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent or the gate said, verbatim, for the next prompt. */
  output: string;
  at: string;
  /**
   * How many findings the round brought back: checks red at a gate, review
   * threads left open, a proof's failing assertions.
   *
   * Absent is "nobody said", and a round that says nothing is weighed at the
   * origin's patient level rather than guessed at.
   */
  findings?: number;
  /** Absent keeps older agents and workflows behaving exactly as they did. */
  progress?: Progress;
}

/**
 * The coding agent, and the only probabilistic thing in the system.
 *
 * A prompt, a directory and a context in; an answer and an account of what
 * it cost out. Without that account there is nothing to escalate on and
 * nothing to budget against, so it is part of the contract.
 *
 * It is one method on purpose. A step — triage, implement, a review — is a
 * prompt and what the workflow does with the answer, and it is built on this
 * in the workflow or with a helper from `@amykit/agent-kit`. A method per
 * step put one workflow's lifecycle into every workflow's contract, and an
 * agent that committed and pushed took a decision that is the workflow's.
 * See docs/design/an-agent-only-answers.md; `L0.THE_AGENT_PORT_ONLY_ASKS`
 * keeps it this way.
 */
export interface Agent {
  ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
}
