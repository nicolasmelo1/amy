import fs from "node:fs";
import path from "node:path";
import type { HarnessReply, Operated } from "@amykit/core";
import { StepResult } from "./assertions.js";
import { OperationCall, Step, meets } from "./scenario.js";
import { segment } from "./names.js";

/**
 * What a step runs through: the mounted operations, and a harness only an
 * agent step ever starts. A deterministic step runs no model; an operation
 * whose own plugin calls one inside it is that plugin's business.
 */
export interface OfferedOperation {
  readonly id: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** How many turns an agent step may take before it is unsupported: a model that never says done costs without end. */
const AGENT_TURNS = 12;

/** How much of one call's output a turn shows the agent: enough to read refs, not a page dump per turn. */
const SHOWN = 4000;

export interface StepPorts {
  operate(id: string, input: unknown): Promise<Operated>;
  /** Asks the harness; absent where none is mounted, and then an agent step is unsupported. */
  readonly ask?: (prompt: string) => Promise<HarnessReply>;
  readonly replays: Replays;
  /** The operations the agent may call: each id, with the JSON Schema its input is checked against. */
  readonly offered: readonly OfferedOperation[];
}

/** An agent step that passed, kept as the operations it called. */
export interface Replay {
  readonly calls: readonly OperationCall[];
}

/**
 * The replays one scenario keeps, beside the proofs: the next run calls the
 * same operations with no model, and the agent runs again only where the
 * replay breaks.
 */
export class Replays {
  constructor(private readonly root: string) {}

  get(scenario: string, step: string): Replay | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(scenario, step), "utf-8")) as Replay;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** Forgets a kept replay: one whose step's assertions failed would pin a wrong attempt. */
  remove(scenario: string, step: string): void {
    fs.rmSync(this.file(scenario, step), { force: true });
  }

  put(scenario: string, step: string, replay: Replay): void {
    const file = this.file(scenario, step);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(replay, null, 2)}\n`);
  }

  private file(scenario: string, step: string): string {
    return path.join(this.root, segment(scenario), `${segment(step)}.json`);
  }
}

/** One operation call, as a step's result. */
async function call(ports: Pick<StepPorts, "operate">, one: OperationCall): Promise<StepResult> {
  const ran = await ports.operate(one.operation, one.input);
  return ran.ok ? { status: "done", output: ran.output } : { status: "failed", why: `\`${one.operation}\` answered ${ran.error.code}: ${ran.error.message}` };
}

/** Runs a deterministic step: its one operation, no harness. */
export async function runDeterministic(step: Extract<Step, { kind: "deterministic" }>, ports: Pick<StepPorts, "operate">): Promise<StepResult> {
  return call(ports, step);
}

/** One check of a wait-until step: whether it holds now, and what the operation said. */
export async function checkUntil(step: Extract<Step, { kind: "wait-until" }>, ports: Pick<StepPorts, "operate">): Promise<{ readonly holds: boolean; readonly result: StepResult }> {
  const result = await call(ports, step);
  return { holds: result.status === "done" && meets(result.output, step.expect), result };
}

/** What a wait-until step that ran out of time fails with, naming its check. */
export function untilMissed(step: Extract<Step, { kind: "wait-until" }>, last: StepResult | undefined): StepResult {
  const said = last?.status === "done" ? `; it last answered ${JSON.stringify(last.output)}` : last ? `; ${last.why}` : "";
  return {
    status: "failed",
    why: `the check \`${step.operation}\`${step.expect.path ? ` on \`${step.expect.path}\`` : ""} did not hold within ${step.deadlineMs}ms${said}`,
  };
}

/** What an agent step ended with, and the calls that got it there: kept as its replay only once its assertions pass. */
export interface AgentRun {
  readonly result: StepResult;
  readonly calls: readonly OperationCall[];
}

/**
 * Runs an agent step. A replay kept from a run that passed is called first,
 * with no model; the harness is asked only when there is none, or from the
 * call where the replay broke. What the agent cannot settle is unsupported.
 * Nothing is kept here: the run keeps the calls once the step's assertions
 * pass.
 */
export async function runAgent(scenario: string, step: Extract<Step, { kind: "agent" }>, ports: StepPorts): Promise<AgentRun> {
  const kept = ports.replays.get(scenario, step.id);
  const replayed = kept ? await replay(kept, ports) : { ran: [] };
  if (replayed.last && !replayed.broke) return { result: replayed.last, calls: replayed.ran };
  if (!ports.ask) return unsupported(`the step \`${step.id}\` needs an agent, and no harness is mounted`);
  return turns(step, ports, ports.ask, replayed);
}

/**
 * The agent's turns. Each one shows what every call so far answered, so it
 * can use a ref one call returned in the next; only the calls that worked
 * are kept.
 */
async function turns(
  step: Extract<Step, { kind: "agent" }>,
  ports: StepPorts,
  ask: (prompt: string) => Promise<HarnessReply>,
  replayed: { readonly ran: OperationCall[]; readonly last?: StepResult; readonly broke?: { readonly at: OperationCall; readonly why: string } },
): Promise<AgentRun> {
  const ran: OperationCall[] = [...replayed.ran];
  const seen: Turn[] = replayed.broke ? [{ call: replayed.broke.at, answered: { status: "failed", why: replayed.broke.why } }] : [];
  let last: StepResult | undefined = replayed.broke ? undefined : replayed.last;
  for (let turn = 0; turn < AGENT_TURNS; turn += 1) {
    const reply = await ask(agentPrompt(step, ports.offered, replayed.ran, seen));
    const answer = reply.run.outcome === "completed" ? answerIn(reply.text) : { unsupported: `the agent did not finish \`${step.id}\`: ${reply.run.output || reply.run.outcome}` };
    if (!answer) return unsupported(`the agent answered \`${step.id}\` with nothing amy can read`);
    if ("unsupported" in answer) return unsupported(answer.unsupported);
    if ("done" in answer) return last ? { result: last, calls: ran } : unsupported(`the agent called nothing for \`${step.id}\``);
    const answered = await call(ports, answer.call);
    seen.push({ call: answer.call, answered });
    if (answered.status === "done") {
      ran.push(answer.call);
      last = answered;
    }
  }
  return unsupported(`the agent did not settle \`${step.id}\` in ${AGENT_TURNS} turns`);
}

/** One call an agent made this run, with what it answered. */
interface Turn {
  readonly call: OperationCall;
  readonly answered: StepResult;
}

function unsupported(why: string): AgentRun {
  return { result: { status: "unsupported", why }, calls: [] };
}

/** A kept replay's calls, in order, until one breaks: what ran, the last result, and where it broke. */
async function replay(kept: Replay, ports: Pick<StepPorts, "operate">): Promise<{ ran: OperationCall[]; last?: StepResult; broke?: { readonly at: OperationCall; readonly why: string } }> {
  const ran: OperationCall[] = [];
  let last: StepResult | undefined;
  for (const one of kept.calls) {
    last = await call(ports, one);
    if (last.status !== "done") return { ran, last, broke: { at: one, why: last.why } };
    ran.push(one);
  }
  return { ran, ...(last ? { last } : {}) };
}

function shown(result: StepResult): string {
  const text = result.status === "done" ? JSON.stringify(result.output) : `${result.status}: ${result.why}`;
  return text.length > SHOWN ? `${text.slice(0, SHOWN)}… (${text.length - SHOWN} more characters)` : text;
}

function agentPrompt(step: Extract<Step, { kind: "agent" }>, offered: readonly OfferedOperation[], replayed: readonly OperationCall[], seen: readonly Turn[]): string {
  return [
    `Prove one step of a scenario by calling operations, one at a time, never by changing code: ${step.prompt}`,
    `The operations you may call, each with the JSON Schema of its input:\n${offered.map((one) => `- \`${one.id}\`: ${JSON.stringify(one.input)}`).join("\n") || "(none)"}`,
    ...(replayed.length > 0 ? [`A kept replay already ran these, in order, and they need not run again: ${JSON.stringify(replayed)}.`] : []),
    ...(seen.length > 0 ? [`What each call so far answered, in order:\n${seen.map((one) => `- ${JSON.stringify(one.call)} → ${shown(one.answered)}`).join("\n")}`] : []),
    "Answer with one JSON object as the last thing you say: " +
      '{"call":{"operation":"<id>","input":{...}}} for the next call, {"done":true} once the last call\'s answer is what the step is about, ' +
      'or {"unsupported":"<why>"} when calling them cannot settle it.',
  ].join("\n\n");
}

type Answer = { readonly call: OperationCall } | { readonly done: true } | { readonly unsupported: string };

/** The last JSON object in a reply, read as the next call, done, or why it cannot be settled. */
function answerIn(text: string): Answer | undefined {
  // `lastIndexOf("{", -1)` searches position zero again, so the scan stops
  // explicitly once it has tried the first character.
  for (let start = text.lastIndexOf("{"); start >= 0; start = start === 0 ? -1 : text.lastIndexOf("{", start - 1)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
    } catch {
      continue;
    }
    return readAnswer(parsed);
  }
  return undefined;
}

function readAnswer(parsed: unknown): Answer | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { call: next, done, unsupported: why } = parsed as { call?: unknown; done?: unknown; unsupported?: unknown };
  if (typeof why === "string") return { unsupported: why };
  if (done === true) return { done: true };
  if (typeof next !== "object" || next === null || typeof (next as OperationCall).operation !== "string") return undefined;
  const input = (next as { input?: unknown }).input;
  return { call: { operation: (next as OperationCall).operation, input: typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {} } };
}
