import { AgentRun } from "../agent-run.js";

export interface HarnessReply {
  /** Just the answer, with whatever envelope carried it stripped away. */
  text: string;
  run: AgentRun;
}

/**
 * What a caller knows about a question that a relay might need and the CLI
 * answering it never does.
 *
 * Both fields are for whoever composes harnesses rather than for the harness
 * itself: one ties the account to the work it was spent on, the other lets a
 * skill named for a step be the thing that answers. A single-harness install
 * ignores both, which is why they are optional.
 */
export interface AskContext {
  workId?: string;
  /** The action being performed, in the workflow's own vocabulary. */
  step?: string;
}

/**
 * One coding agent CLI, reduced to the only thing that differs between them.
 *
 * A prompt, a directory, and an account of what the answer cost. Nothing here
 * names a ticket, a plan or a review, which is why it is a port of the core:
 * the workflow-shaped things an agent does are built *on* this, one layer up,
 * and a second workflow wants this rather than the first workflow's prompts.
 */
export interface Harness {
  readonly name: string;
  ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
}
