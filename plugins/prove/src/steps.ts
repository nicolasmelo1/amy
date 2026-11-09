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
export interface StepPorts {
  operate(id: string, input: unknown): Promise<Operated>;
  /** Asks the harness; absent where none is mounted, and then an agent step is unsupported. */
  readonly ask?: (prompt: string) => Promise<HarnessReply>;
  readonly replays: Replays;
  /** The operations the agent may call, by id. */
  readonly offered: readonly string[];
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
  const unsupported = (why: string): AgentRun => ({ result: { status: "unsupported", why }, calls: [] });

  if (!ports.ask) return unsupported(`the step \`${step.id}\` needs an agent, and no harness is mounted`);
  const reply = await ports.ask(agentPrompt(step, ports.offered, replayed.ran, replayed.broke));
  if (reply.run.outcome !== "completed") return unsupported(`the agent did not finish \`${step.id}\`: ${reply.run.output || reply.run.outcome}`);
  const answer = answerIn(reply.text);
  if (!answer) return unsupported(`the agent answered \`${step.id}\` with no calls amy can read`);
  if ("unsupported" in answer) return unsupported(answer.unsupported);
  const ran = [...replayed.ran];
  let last: StepResult | undefined;
  for (const one of answer.calls) {
    last = await call(ports, one);
    if (last.status !== "done") return { result: last, calls: [] };
    ran.push(one);
  }
  return last ? { result: last, calls: ran } : unsupported(`the agent called nothing for \`${step.id}\``);
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

function agentPrompt(step: Extract<Step, { kind: "agent" }>, offered: readonly string[], ran: readonly OperationCall[], broke: { readonly at: OperationCall; readonly why: string } | undefined): string {
  return [
    `Prove one step of a scenario by calling operations, never by changing code: ${step.prompt}`,
    `The operations you may call: ${offered.map((id) => `\`${id}\``).join(", ") || "(none)"}.`,
    ...(ran.length > 0 ? [`These already ran, in order, and need not run again: ${JSON.stringify(ran)}.`] : []),
    ...(broke ? [`The kept replay broke at ${JSON.stringify(broke.at)}: ${broke.why}. Continue from there.`] : []),
    'Answer with one JSON object as the last thing you say: {"calls":[{"operation":"<id>","input":{...}}]} — the calls still to make, in order — or {"unsupported":"<why>"} when this cannot be settled by calling them.',
  ].join("\n\n");
}

type Answer = { readonly calls: readonly OperationCall[] } | { readonly unsupported: string };

/** The last JSON object in a reply, read as the calls to make or why it cannot be settled. */
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
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { calls, unsupported } = parsed as { calls?: unknown; unsupported?: unknown };
    if (typeof unsupported === "string") return { unsupported };
    if (!Array.isArray(calls)) return undefined;
    const read = calls.filter((one): one is OperationCall => typeof one === "object" && one !== null && typeof (one as OperationCall).operation === "string")
      .map((one) => ({ operation: one.operation, input: typeof one.input === "object" && one.input !== null ? one.input : {} }));
    return read.length === calls.length ? { calls: read } : undefined;
  }
  return undefined;
}
