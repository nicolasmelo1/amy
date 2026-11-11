import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BriefRecord,
  BriefStore,
  CommandOutcome,
  Commands,
  Conversation,
  Harness,
  HarnessReply,
  HostServices,
  MountedOperation,
  Notifier,
  OPERATIONS_COLLECTION,
  Operation,
  Plan,
  Plugin,
  Reply,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  actionsOf,
  applyPlan,
  defineOperation,
  fail,
  implementationOf,
  mount,
  movedBy,
  runAction,
  withDiagramBeside,
} from "@amykit/core";
import { fakeRun } from "@amykit/test-fixtures";
import { z } from "zod";
import { plugin as declared } from "../src/plugin.js";
import type { ProveRecord } from "../src/decide.js";
import { SCENARIO_SECTION } from "../src/scenario.js";

/** The proving workflow as the host mounts it, shaped by the diagram at the package root. */
export const prove = withDiagramBeside(declared, import.meta.url);

/** A plugin offering the operations a test names, each answering what its function says. */
export function operationsPlugin(name: string, answers: Record<string, (input: Record<string, unknown>) => unknown>): Plugin {
  return {
    name,
    operations: Object.entries(answers).map(([id, answer]) => defineOperation({
      id,
      domain: id.split(".")[0]!,
      summary: id,
      description: id,
      input: z.record(z.string(), z.unknown()),
      output: z.unknown(),
      errors: { [`${id.split(".")[0]}.refused`]: { description: "the system said no" } },
      writes: [],
      http: { method: "post", path: `/${id.replace(".", "/")}` },
      examples: [],
      async handler(input) {
        const answered = answer(input);
        return answered instanceof Error ? fail(`${id.split(".")[0]}.refused`, answered.message) : answered;
      },
    })),
    register() {},
  };
}

/** A command the fake commands port runs: what it answers, by name. */
export type CommandScript = Record<string, () => Pick<CommandOutcome, "ok" | "output"> & { exitCode?: number | null }>;

/**
 * The world a proving run meets: a brief store, a person in a thread, a
 * harness, the commands port and the system the operations reach, all in
 * memory, with a clock the test moves.
 */
export class ProveWorld {
  readonly home: string;
  readonly artifacts: string;
  readonly briefs = new Map<string, BriefRecord>();
  readonly said: { text: string; kind?: string }[] = [];
  readonly posted: { thread: string; text: string }[] = [];
  readonly replies = new Map<string, Reply[]>();
  readonly ran: string[] = [];
  readonly asked: string[] = [];
  harnessReplies: string[] = [];
  clock = Date.UTC(2026, 10, 8, 12, 0, 0);

  constructor(readonly config: Record<string, unknown> = {}, readonly commands: CommandScript = {}, home?: string) {
    this.home = home ?? fs.mkdtempSync(path.join(os.tmpdir(), "amy-prove-"));
    this.artifacts = path.join(this.home, "projects", "p", "artifacts");
  }

  readonly now = (): Date => new Date(this.clock);

  brief(unit: string, scenario: string, revision = 1): void {
    this.briefs.set(unit, { id: unit, sections: [{ name: SCENARIO_SECTION, body: scenario }], questions: [], explains: [], createdAt: "", updatedAt: "", revision });
  }

  answer(thread: string, text: string, author = "ada"): void {
    this.replies.set(thread, [...(this.replies.get(thread) ?? []), { at: this.now().toISOString(), author, text, files: [] }]);
  }

  ports(): Plugin[] {
    const store: BriefStore = {
      get: async (id) => this.briefs.get(id) ?? null,
      write: async () => { throw new Error("the proving phase writes no brief"); },
      appendQuestion: async () => { throw new Error("the proving phase appends no question"); },
      retired: async () => [],
      remove: async () => undefined,
    };
    const notifier: Notifier = { announce: async ({ text, kind }) => { this.said.push({ text, ...(kind ? { kind } : {}) }); } };
    const conversation: Conversation = {
      known: async (workId) => ({ id: `thread-${workId}` }),
      open: async (workId) => ({ id: `thread-${workId}` }),
      post: async (thread, message) => { this.posted.push({ thread: thread.id, text: message.text }); return "ts"; },
      replies: async (thread, since) => (this.replies.get(thread.id) ?? []).filter((one) => one.at >= since),
    };
    const agent: Harness = {
      name: "fake",
      ask: async (prompt): Promise<HarnessReply> => {
        this.asked.push(prompt);
        const text = this.harnessReplies.shift() ?? '{"unsupported":"the fake harness has nothing scripted"}';
        return { text, run: fakeRun({ output: text }) };
      },
    };
    const commands: Commands = {
      available: () => Object.keys(this.commands),
      run: async (name) => {
        this.ran.push(name);
        const script = this.commands[name];
        if (!script) return { name, ok: false, exitCode: 127, output: `${name}: not allowed`, at: this.now().toISOString() };
        const answer = script();
        return { name, exitCode: answer.ok ? 0 : 1, ...answer, at: this.now().toISOString() };
      },
    };
    const ports: Record<string, object> = { brief: store, notifier, conversation, agent, commands };
    return Object.entries(ports).map(([kind, impl]) => ({ name: `fake-${kind}`, register: (registry) => registry.port(kind, impl) }));
  }

  host(): HostServices {
    return {
      runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      now: this.now,
      paths: { state: this.home, profile: path.join(this.home, "projects", "p", "prove"), artifacts: this.artifacts },
    };
  }

  async mounted(system: Plugin[] = [], without: string[] = []): Promise<Mounted> {
    const providers = this.ports().filter((one) => !without.includes(one.name.replace("fake-", "")));
    const outcome = await mount([prove, ...providers, ...system], { [prove.name]: this.config }, this.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;
    const offered = outcome.mounted.contributions.get(OPERATIONS_COLLECTION) ?? new Map();
    const operations = [...offered.entries()].map(([id, entry]) => ({ id, input: inputSchema((entry as MountedOperation).operation as unknown as Operation) }));
    return { workflow, runtime, operations };
  }
}

/** An operation's input as the brief check is handed it: JSON Schema, read the way the contract reads it. */
function inputSchema(operation: Operation): Record<string, unknown> {
  return operation.input["~standard"].jsonSchema.input({ target: "draft-2020-12" }) as Record<string, unknown>;
}

export interface Mounted {
  readonly workflow: Workflow;
  readonly runtime: WorkflowRuntime;
  readonly operations: { readonly id: string; readonly input: Record<string, unknown> }[];
}

export interface Look {
  readonly from: string;
  readonly to: string;
  readonly plan: Plan;
  readonly actions: string[];
}

/** One look, the way the engine takes it: observe, plan, run the actions, remember. */
export async function look(mounted: Mounted, record: ProveRecord, now: Date): Promise<{ record: ProveRecord; look: Look }> {
  const observation = await mounted.runtime.observe(record);
  const plan = mounted.workflow.plan(record, observation, mounted.runtime.policy);
  const outcomes: Record<string, unknown> = {};
  for (const action of actionsOf(plan)) {
    await runAction(implementationOf(mounted.runtime, action.type), action, { record, observation, outcomes }, () => undefined);
  }
  const next = plan.kind === "settled"
    ? record
    : mounted.runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan)) as ProveRecord;
  return { record: next, look: { from: record.state, to: next.state, plan, actions: actionsOf(plan).map((one) => one.type) } };
}

/**
 * Looks until the run settles, moving the world's clock a second a look —
 * or by a wait's own delay when `throughWaits` says to sit them out.
 */
export async function walk(
  world: ProveWorld,
  mounted: Mounted,
  record: ProveRecord,
  options: { readonly limit?: number; readonly throughWaits?: boolean; readonly until?: (record: ProveRecord) => boolean } = {},
): Promise<{ record: ProveRecord; looks: Look[] }> {
  const looks: Look[] = [];
  let current = record;
  for (let step = 0; step < (options.limit ?? 60); step += 1) {
    if (options.until?.(current)) return { record: current, looks };
    const taken = await look(mounted, current, world.now());
    looks.push(taken.look);
    current = taken.record;
    if (taken.look.plan.kind === "settled") return { record: current, looks };
    if (taken.look.plan.kind === "wait") {
      if (!options.throughWaits) return { record: current, looks };
      world.clock += taken.look.plan.retryAfterMs;
    } else world.clock += 1000;
  }
  throw new Error(`the run never settled: ${looks.map((one) => one.to).join(" -> ")}`);
}

export function newRun(mounted: Mounted, id: string, input: Record<string, unknown> = {}): ProveRecord {
  const record = mounted.runtime.newRecord(id, new Date(Date.UTC(2026, 10, 8, 12, 0, 0))) as ProveRecord;
  return { ...record, input };
}
