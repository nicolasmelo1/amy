import { AgentRun } from "@amy/core";

export interface HarnessReply {
  /** Just the answer, with whatever envelope carried it stripped away. */
  text: string;
  run: AgentRun;
}

/**
 * One coding agent CLI, reduced to the only thing that differs between them.
 *
 * Everything else an agent does for a ticket — which prompt, getting onto the
 * branch, committing, deciding that a clean run which changed nothing is a
 * failure — is the same whichever harness answers, and lives in
 * `HarnessAgent`. What is genuinely per-harness is how to invoke it and how
 * to read what it spent out of its own envelope.
 */
export interface Harness {
  readonly name: string;
  ask(prompt: string, cwd: string): Promise<HarnessReply>;
}
