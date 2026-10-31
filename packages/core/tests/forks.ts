// A fork of lanes the core's suites mount and walk, one look at a time.
import {
  ConfigSchema,
  HostServices,
  Plugin,
  WORKFLOW_RUNTIME,
  WorkRecord,
  Workflow,
  WorkflowRuntime,
  WorkflowPieceContext,
  act,
  actionsOf,
  advance,
  applyPlan,
  call,
  defineWorkflow,
  implementationOf,
  mount,
  movedBy,
  runAction,
  settled,
  withDiagram,
} from "../src/index.js";

const NO_SETTINGS = {} satisfies ConfigSchema;

export type TaskRecord = WorkRecord & { state: "WORKING" | "DONE" | "DECLINED" | "STUCK"; input: { task: string }; worked?: number };

/** What a task does on each look, given the scope it was mounted with: the test says. */
export type Work = (scope: WorkflowPieceContext<typeof NO_SETTINGS, object, Record<never, never>>, record: TaskRecord) => Promise<string | void>;

/**
 * A callee with three ends: done after `looks` looks, declined when its task
 * says so, and stuck — an end with no edge in a caller that forgets it —
 * never, unless the test draws it.
 */
export function task(options: {
  /** How many looks the work takes, for every task or by task. */
  looks?: number | ((task: string) => number);
  work?: Work;
  ends?: "two" | "three";
  waitsOn?: string;
  /** A task whose decision nobody has written yet. */
  unwritten?: string;
  /** The last look works on its way to `DONE`: an advance carrying the work, rather than an act before it. */
  finishWorking?: boolean;
  /** How the work is wired: a handler (the default), or the agent's `ask`, as a port and a method. */
  agent?: boolean;
} = {}) {
  const looksFor = (record: TaskRecord): number => (typeof options.looks === "function" ? options.looks(record.input.task) : options.looks ?? 1);
  const ends = options.ends === "three" ? "    WORKING --> STUCK\n    STUCK --> [*]\n" : "";
  return withDiagram(defineWorkflow({
    name: "task",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    input: { task: { type: "string", required: true, description: "what this lane does" } },
    output: {
      DONE: (record: TaskRecord) => ({ did: record.input.task, looks: record.worked ?? 0 }),
      DECLINED: (record: TaskRecord) => ({ refused: record.input.task }),
    },
    decide: {
      WORKING: (record: TaskRecord) => {
        if (record.input.task === options.waitsOn) return { kind: "wait", retryAfterMs: 60_000, effects: [], why: "waiting on its owner" };
        if (record.input.task === options.unwritten) return settled(`the decision for \`${record.state}\` is not written yet`);
        const looks = looksFor(record);
        if (options.finishWorking && (record.worked ?? 0) === looks) return advance("DONE", "done, working on the way out", { type: "work" });
        if (record.input.task.startsWith("refuse")) return advance("DECLINED", "refused");
        return (record.worked ?? 0) < looks ? act(`working on ${record.input.task}`, { type: "work" }) : advance("DONE", "done");
      },
      DONE: () => settled("done"),
      DECLINED: () => settled("declined"),
      ...(options.ends === "three" ? { STUCK: () => settled("stuck") } : {}),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: options.agent ? { work: { port: "agent", method: "ask" } } : {
      work: async (scope, work) => {
        const said = await options.work?.(scope as never, work.record as TaskRecord);
        work.outcomes.worked = said ?? true;
      },
    },
    remember: (_scope, record: TaskRecord, outcomes) => (outcomes.worked ? { ...record, worked: (record.worked ?? 0) + 1 } : record),
  }), `stateDiagram-v2
    [*] --> WORKING
    WORKING --> DONE
    WORKING --> DECLINED
${ends}    DONE --> [*]
    DECLINED --> [*]
`);
}

export type PlannerRecord = WorkRecord & { state: string; tasks?: string[]; commit?: string; done?: string[]; joinedWith?: unknown };

export const PLANNER = (lanes: readonly string[], join = "merge") => `stateDiagram-v2
    state split <<fork>>
    state ${join} <<join>>
    [*] --> PLANNED
    PLANNED --> split
${lanes.map((lane) => `    split --> ${lane}\n    ${lane} --> ${join}: DONE\n    ${lane} --> ${join}: DECLINED\n`).join("")}    ${join} --> INTEGRATED: every lane is done
    ${join} --> ESCALATED: a lane declined
    INTEGRATED --> [*]
    ESCALATED --> [*]
    class ${lanes.join(", ")} call
`;

/**
 * The plan's own caller: it forks into a lane per task, each lane given its
 * own task as input, and its join reads how each one ended.
 */
export function planner(options: {
  lanes?: readonly string[];
  diagram?: string;
  callee?: ReturnType<typeof task>;
  branch?: (lane: string) => string | undefined;
  revision?: boolean;
} = {}): Plugin {
  const lanes = options.lanes ?? ["TASK_A", "TASK_B", "TASK_C"];
  const callee = options.callee ?? task();
  return withDiagram(defineWorkflow({
    name: "planner",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    calls: Object.fromEntries(lanes.map((lane, index) => [lane, call(callee, {
      input: (work: PlannerRecord) => ({ task: work.tasks?.[index] ?? lane.toLowerCase() }),
      output: { DONE: (work: PlannerRecord, out) => ({ ...work, done: [...(work.done ?? []), out.did] }) },
      ...(options.branch?.(lane) === undefined ? {} : { branch: options.branch(lane)! }),
      ...(options.revision ? { revision: (work: PlannerRecord) => work.commit } : {}),
    })])),
    decide: {
      PLANNED: () => advance("split", "planned"),
      merge: (record: PlannerRecord) => {
        const ended = Object.values(record.lanes ?? {});
        return ended.every((lane) => lane.end === "DONE")
          ? advance("INTEGRATED", `every lane is done: ${(record.done ?? []).join(", ")}`)
          : advance("ESCALATED", "a lane declined");
      },
      INTEGRATED: () => settled("integrated"),
      ESCALATED: () => settled("escalated"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
    remember: (_scope, record: PlannerRecord, _outcomes, _observation, moved) =>
      moved?.to === "INTEGRATED" || moved?.to === "ESCALATED" ? { ...record, joinedWith: record.lanes } : record,
  }), options.diagram ?? PLANNER(lanes));
}

export async function mounted(plugins: readonly Plugin[], host: HostServices): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const outcome = await mount(plugins, {}, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

/** One look, as the serial engine takes it, and the plan it made. */
async function look(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, now: Date): Promise<{ next: WorkRecord; plan: ReturnType<Workflow["plan"]>; outcomes: Record<string, unknown> } | undefined> {
  const observation = await runtime.observe(record);
  const plan = workflow.plan(record, observation, runtime.policy);
  if (plan.kind === "settled") return undefined;
  const outcomes: Record<string, unknown> = {};
  for (const action of actionsOf(plan)) {
    await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
  }
  return { next: runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan)), plan, outcomes };
}

/** Looks until the record settles, or `until` says stop, keeping every plan. */
export async function walk(
  workflow: Workflow,
  runtime: WorkflowRuntime,
  record: WorkRecord,
  now: Date,
  until: (record: WorkRecord) => boolean = () => false,
): Promise<{ record: WorkRecord; plans: ReturnType<Workflow["plan"]>[]; outcomes: Record<string, unknown>[] }> {
  let current = record;
  const plans: ReturnType<Workflow["plan"]>[] = [];
  const outcomes: Record<string, unknown>[] = [];
  for (let count = 0; count < 100; count += 1) {
    if (until(current)) return { record: current, plans, outcomes };
    const taken = await look(workflow, runtime, current, now);
    if (!taken) return { record: current, plans, outcomes };
    plans.push(taken.plan);
    outcomes.push(taken.outcomes);
    current = taken.next;
  }
  throw new Error(`did not settle; last in ${current.state}`);
}
