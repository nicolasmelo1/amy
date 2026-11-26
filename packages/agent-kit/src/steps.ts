import { Agent, AgentResult, AskContext, AttemptOutcome, HarnessReply } from "@amykit/core";
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
 * The commit is the step's business and not a verdict: it runs for the rung
 * that comes back, and what it says is the account of whether the attempt
 * moved anything. A run that ended without changing a file is still an
 * answer, with `unchanged` progress and the agent's own words as the reason,
 * so a retry policy can tell work that added nothing from work that failed. A
 * step that declared a `verify` of its own keeps it, and that one alone
 * decides whether the relay climbs. A run that did not complete is returned
 * rather than thrown, with its account.
 */
export async function implementStep(agent: Agent, input: ImplementInput): Promise<AgentResult<AttemptOutcome>> {
  // The commit is the step's business, not a verdict: it runs once for every
  // rung that comes back, and what it says about the last one is the whole
  // account of whether this attempt moved anything. A step that declared a
  // verify of its own keeps it: that one, and only that one, decides a climb.
  let changed = false;
  let asked = false;
  const declares = input.context?.verify;
  const verify = async (reply: HarnessReply): Promise<HarnessReply> => {
    asked = true;
    // The head moved if any rung of this attempt moved it: the rung that came
    // back and found the earlier rung's work in place added nothing, and the
    // attempt still changed the tree.
    changed = (await input.commit()) || changed;
    return declares ? declares(reply) : reply;
  };

  let reply = await agent.ask(input.prompt, input.cwd, { ...input.context, verify });
  // An agent that never calls `verify`, as one harness on its own does, still
  // has its work committed and weighed once.
  if (!asked && reply.run.outcome === "completed") reply = await verify(reply);

  const at = (input.now ?? (() => new Date()))().toISOString();
  const key = input.key ?? "implementation";
  if (reply.run.outcome !== "completed") {
    return { value: { ok: false, output: reply.run.output, at }, run: reply.run };
  }
  // A run that ended without changing a file is an answer, on the rung that
  // gave it. The agent's own words are the reason, because a stronger model
  // does not know something this one did not.
  const progress = changed
    ? ({ kind: "advanced", key } as const)
    : ({ kind: "unchanged", key, detail: reply.text } as const);
  return { value: { ok: true, output: reply.run.output, at, progress }, run: reply.run };
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
 * An answer with no object in it, or one the caller's reader refuses, is the
 * action's failure: the reply is read and the error it raises is the answer,
 * so a reader's own words reach the operator and no stronger rung is bought
 * for a shape this one already gave.
 */
export async function judgeStep<T>(agent: Agent, input: JudgeInput<T>): Promise<AgentResult<T>> {
  const reply = await agent.ask(input.prompt, input.cwd, input.context);
  if (reply.run.outcome !== "completed") return { value: input.fallback, run: reply.run };
  return { value: input.read(extractJson<unknown>(reply.text)), run: reply.run };
}
