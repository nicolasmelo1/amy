import { Agent, AgentResult, AskContext, AttemptOutcome } from "@amykit/core";
import { extractJson } from "./json.js";

/** One question to the agent, in the directory the work is in. */
export interface StepInput {
  prompt: string;
  cwd: string;
  context?: AskContext;
}

export interface ImplementInput extends StepInput {
  /**
   * Commits what the agent left behind, and says whether there was anything.
   *
   * The caller's, because when work is committed and when it reaches the
   * remote are the workflow's decisions: one pushes after every attempt,
   * another once per cycle. This helper never names git.
   */
  commit: () => Promise<boolean>;
  /** The progress key a retry is judged by. */
  key?: string;
  now?: () => Date;
}

/**
 * Asks for a change, commits it through the caller, and says whether it moved.
 *
 * A run that completed and changed no file is a failure with `unchanged`
 * progress, so a retry policy can tell an attempt that added nothing from
 * one that did. A run that did not complete is returned rather than thrown:
 * a relay above may hand the step to another harness, and it needs the run
 * to decide.
 */
export async function implementStep(agent: Agent, input: ImplementInput): Promise<AgentResult<AttemptOutcome>> {
  const reply = await agent.ask(input.prompt, input.cwd, input.context);
  const at = (input.now ?? (() => new Date()))().toISOString();
  const key = input.key ?? "implementation";

  if (reply.run.outcome !== "completed") {
    return { value: { ok: false, output: reply.run.output, at }, run: reply.run };
  }

  if (!(await input.commit())) {
    const detail = "the agent finished without changing any file";
    return {
      value: { ok: false, output: `${detail}\n\n${reply.run.output}`, at, progress: { kind: "unchanged", key, detail } },
      run: { ...reply.run, outcome: "failed" },
    };
  }

  return { value: { ok: true, output: reply.run.output, at, progress: { kind: "advanced", key } }, run: reply.run };
}

export interface JudgeInput<T> extends StepInput {
  /** Turns the JSON object the prompt asked for into the step's answer. */
  read: (answer: unknown) => T;
  /** The answer when the run did not complete, so there is nothing to read. */
  fallback: T;
}

/**
 * Asks a question whose answer is one JSON object, and reads it.
 *
 * A run that did not complete yields the caller's fallback with the run's
 * account, for the same reason `implementStep` returns rather than throws.
 */
export async function judgeStep<T>(agent: Agent, input: JudgeInput<T>): Promise<AgentResult<T>> {
  const reply = await agent.ask(input.prompt, input.cwd, input.context);
  if (reply.run.outcome !== "completed") return { value: input.fallback, run: reply.run };
  return { value: input.read(extractJson<unknown>(reply.text)), run: reply.run };
}
