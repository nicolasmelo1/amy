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

const NO_CHANGE = "the agent finished without changing any file";
const NO_JSON = "the answer held no readable JSON object";
const NOTHING_TO_CHANGE = "NOTHING_TO_CHANGE";

/**
 * The reason an implementing run gave for changing nothing, when it gave one.
 *
 * Read from a line of its own, marked the way an agent marks the line it was
 * asked for: a bullet, a heading, bold or code around it. Silence is no
 * reason at all, and a run that is silent about changing nothing is a run that
 * gave up.
 */
function nothingToChange(text: string): string | undefined {
  for (const line of text.split("\n")) {
    // An agent marks the line the way it marks any other: a bullet, a
    // heading, bold or code around it, and the mark at both ends.
    const said = line.replace(/^[\s>*_`#-]+/, "").replace(/[\s*_`]+$/, "").trim();
    if (!said.toUpperCase().startsWith(NOTHING_TO_CHANGE)) continue;
    const reason = said.slice(NOTHING_TO_CHANGE.length).replace(/^[\s:.—-]+/, "").trim();
    return reason === "" ? "the agent said there was nothing to change" : reason;
  }
  return undefined;
}

/**
 * Asks for a change, commits it through the caller, and says whether it moved.
 *
 * The commit runs as the context's `verify`, so a relay commits after each
 * rung that completed and climbs on one that changed nothing, exactly as it
 * climbs on a failure. Over an agent that never calls `verify` the commit
 * runs once the answer is back. A run that completed and changed no file is
 * a failure with `unchanged` progress, so a retry policy can tell an attempt
 * that added nothing from one that did. A run that did not complete is
 * returned rather than thrown, with its account.
 */
export async function implementStep(agent: Agent, input: ImplementInput): Promise<AgentResult<AttemptOutcome>> {
  // The last run `verify` judged, and whether it changed anything. Only the
  // run that comes back is the attempt's, so an earlier rung's verdict never
  // speaks for a later rung that failed for another reason.
  let judged: { reply: HarnessReply; changed: boolean } | undefined;
  const verify = async (reply: HarnessReply): Promise<HarnessReply> => {
    const changed = await input.commit();
    // A run that says why it changed nothing is an answer, on this rung: the
    // stronger model would reach the same conclusion for more money. One that
    // says nothing is a run that gave up, and climbs.
    const reason = changed ? undefined : nothingToChange(reply.text);
    const verdict: HarnessReply = changed || reason !== undefined
      ? reply
      : { ...reply, run: { ...reply.run, outcome: "failed" as const, refused: NO_CHANGE, output: `${NO_CHANGE}\n\n${reply.run.output}` } };
    judged = { reply: verdict, changed };
    return verdict;
  };

  let reply = await agent.ask(input.prompt, input.cwd, { ...input.context, verify });
  if (reply.run.outcome === "completed" && judged?.reply !== reply) reply = await verify(reply);

  const at = (input.now ?? (() => new Date()))().toISOString();
  const key = input.key ?? "implementation";

  const nothing = judged?.reply === reply && !judged.changed ? nothingToChange(reply.text) : undefined;
  if (nothing !== undefined) {
    return { value: { ok: true, output: reply.run.output, at, progress: { kind: "unchanged", key, detail: nothing } }, run: reply.run };
  }
  if (judged?.reply === reply && !judged.changed) {
    return {
      value: { ok: false, output: reply.run.output, at, progress: { kind: "unchanged", key, detail: NO_CHANGE } },
      run: reply.run,
    };
  }
  if (reply.run.outcome !== "completed") {
    return { value: { ok: false, output: reply.run.output, at }, run: reply.run };
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
  // The shape the answer is read in is the step's own check: an answer with no
  // JSON object in it is a run that did not answer, and a relay still has a
  // rung to climb rather than a reply nobody can read.
  const verify = async (reply: HarnessReply): Promise<HarnessReply> => {
    if (reply.run.outcome !== "completed") return reply;
    try {
      extractJson<unknown>(reply.text);
      return reply;
    } catch {
      return { ...reply, run: { ...reply.run, outcome: "failed" as const, refused: NO_JSON, output: `${NO_JSON}\n\n${reply.run.output}` } };
    }
  };

  const reply = await agent.ask(input.prompt, input.cwd, { ...input.context, verify });
  if (reply.run.outcome !== "completed") return { value: input.fallback, run: reply.run };
  try {
    return { value: input.read(extractJson<unknown>(reply.text)), run: reply.run };
  } catch {
    return { value: input.fallback, run: { ...reply.run, outcome: "failed", refused: NO_JSON } };
  }
}
