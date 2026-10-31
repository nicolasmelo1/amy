import { describe, expect, it } from "vitest";
import {
  ConfigSchema,
  HostServices,
  Plugin,
  WORKFLOW_RUNTIME,
  WorkRecord,
  Workflow,
  WorkflowRuntime,
  act,
  actionsOf,
  advance,
  applyPlan,
  call,
  callStanding,
  defineWorkflow,
  implementationOf,
  laneStanding,
  mount,
  movedBy,
  runAction,
  settled,
  wait,
  withDiagram,
} from "@amykit/core";
import { conformance } from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-31T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

const NO_SETTINGS = {} satisfies ConfigSchema;

type TaskRecord = WorkRecord & { state: "WORKING" | "ASKED" | "DONE" | "DECLINED"; input: { task: string; looks: number }; worked?: number; answered?: boolean };
type PlanRecord = WorkRecord & { state: string; done?: string[]; tasks?: [string, number][] };

/** Every look a task took, by task, in the order they happened. */
type Seen = string[];

/**
 * A task: it works for as many looks as its input says, then ends. A task
 * called `ask` stops in `ASKED`, which waits on the person whose work it is,
 * until the test answers it.
 */
function task(seen: Seen, answered: () => boolean = () => false) {
  return withDiagram(defineWorkflow({
    name: "task",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    input: {
      task: { type: "string", required: true, description: "what this lane does" },
      looks: { type: "number", required: true, description: "how many looks the work takes" },
    },
    output: { DONE: (record: TaskRecord) => ({ did: record.input.task }) },
    decide: {
      WORKING: (record: TaskRecord) => {
        if (record.input.task === "ask" && !record.answered) return advance("ASKED", "the task needs its owner");
        if (record.input.task === "decline") return advance("DECLINED", "the task cannot be done");
        return (record.worked ?? 0) < record.input.looks ? act(`working on ${record.input.task}`, { type: "work" }) : advance("DONE", "done");
      },
      ASKED: (_record: TaskRecord, observation: { answered: boolean }) =>
        observation.answered ? advance("WORKING", "the owner answered") : wait(60_000, "waiting on the owner"),
      DONE: () => settled("done"),
      DECLINED: () => settled("declined"),
    },
    record: () => ({}),
    observe: async () => ({ answered: answered() }),
    actions: { work: async (_scope, work) => { seen.push((work.record as TaskRecord).input.task); work.outcomes.worked = true; } },
    remember: (_scope, record: TaskRecord, outcomes, _observation, moved) => {
      const worked = outcomes.worked ? { ...record, worked: (record.worked ?? 0) + 1 } : record;
      return moved?.from === "ASKED" ? { ...worked, answered: true } : worked;
    },
  }), `stateDiagram-v2
    [*] --> WORKING
    WORKING --> DONE
    WORKING --> DECLINED
    WORKING --> ASKED: it needs its owner
    ASKED --> WORKING: answered
    DONE --> [*]
    DECLINED --> [*]
    class ASKED attention
`);
}

/** The plan's diagram: three lanes, each a call, meeting at one join. */
function planner(callee: ReturnType<typeof task>, tasks: readonly [string, number][]): Plugin {
  const lanes = ["TASK_A", "TASK_B", "TASK_C"];
  return withDiagram(defineWorkflow({
    name: "planner",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    calls: Object.fromEntries(lanes.map((lane, index) => [lane, call(callee, {
      input: (work: PlanRecord) => {
        const [name, looks] = (work.tasks ?? tasks)[index]!;
        return { task: name, looks };
      },
      output: { DONE: (work: PlanRecord, out) => ({ ...work, done: [...(work.done ?? []), out.did] }) },
    })])),
    decide: {
      PLANNED: () => advance("split", "planned"),
      merge: (record: PlanRecord) => (Object.values(record.lanes ?? {}).every((lane) => lane.end === "DONE")
        ? advance("INTEGRATED", "every lane is done")
        : advance("ESCALATED", "a lane declined")),
      INTEGRATED: () => settled("integrated"),
      ESCALATED: () => settled("escalated"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
  }), `stateDiagram-v2
    state split <<fork>>
    state merge <<join>>
    [*] --> PLANNED
    PLANNED --> split
    split --> TASK_A
    split --> TASK_B
    split --> TASK_C
    TASK_A --> merge: DONE
    TASK_A --> merge: DECLINED
    TASK_B --> merge: DONE
    TASK_B --> merge: DECLINED
    TASK_C --> merge: DONE
    TASK_C --> merge: DECLINED
    merge --> INTEGRATED: every lane is done
    merge --> ESCALATED: a lane declined
    INTEGRATED --> [*]
    ESCALATED --> [*]
    class TASK_A, TASK_B, TASK_C call
`);
}

async function mounted(plugins: readonly Plugin[]): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const outcome = await mount(plugins, {}, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

/** One look, as the serial engine takes it. */
async function look(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord): Promise<{ next: WorkRecord; why: string } | undefined> {
  const observation = await runtime.observe(record);
  const plan = workflow.plan(record, observation, runtime.policy);
  if (plan.kind === "settled") return undefined;
  const outcomes: Record<string, unknown> = {};
  for (const action of actionsOf(plan)) {
    await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
  }
  return { next: runtime.apply(applyPlan(record, plan, HOST.now(), outcomes), plan, outcomes, observation, HOST.now(), movedBy(record, plan)), why: plan.why };
}

/** Every record the walk passed through, after each look. */
async function walk(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, limit = 40): Promise<{ record: WorkRecord; trail: { record: WorkRecord; why: string }[] }> {
  let current = record;
  const trail: { record: WorkRecord; why: string }[] = [];
  for (let count = 0; count < limit; count += 1) {
    const taken = await look(workflow, runtime, current);
    if (!taken) return { record: current, trail };
    trail.push({ record: taken.next, why: taken.why });
    current = taken.next;
  }
  return { record: current, trail };
}

describe("a fork of three lanes", () => {
  it("starts three callee records at once, each with its own input", async () => {
    const { workflow, runtime } = await mounted([planner(task([]), [["write", 1], ["review", 2], ["test", 3]])]);

    const { trail } = await walk(workflow, runtime, runtime.newRecord("PLAN-1", HOST.now()), 1);

    const forked = trail[0]!.record;
    expect(forked.state).toBe("split");
    expect(forked.lanes).toEqual({
      TASK_A: { call: "PLAN-1/TASK_A#1" },
      TASK_B: { call: "PLAN-1/TASK_B#1" },
      TASK_C: { call: "PLAN-1/TASK_C#1" },
    });
    expect(Object.values(forked.calls ?? {}).map((child) => [child.id, child.state, child.input])).toEqual([
      ["PLAN-1/TASK_A#1", "WORKING", { task: "write", looks: 1 }],
      ["PLAN-1/TASK_B#1", "WORKING", { task: "review", looks: 2 }],
      ["PLAN-1/TASK_C#1", "WORKING", { task: "test", looks: 3 }],
    ]);
  });

  it("leaves the join only when all three have ended, with every output keyed by lane", async () => {
    const seen: Seen = [];
    const { workflow, runtime } = await mounted([planner(task(seen), [["write", 1], ["review", 2], ["test", 3]])]);

    const { record, trail } = await walk(workflow, runtime, runtime.newRecord("PLAN-1", HOST.now()));

    expect(record.state).toBe("INTEGRATED");
    // The lanes take their turns: one move per look, never two at once.
    expect(seen).toEqual(["write", "review", "test", "review", "test", "test"]);
    const atTheJoin = trail.findIndex((step) => step.record.state === "merge");
    for (const step of trail.slice(0, atTheJoin - 1)) {
      if (step.record.state !== "split") continue;
      expect(Object.values(step.record.lanes ?? {}).some((lane) => step.record.calls![lane.call]!.state === "WORKING")).toBe(true);
    }
    expect(Object.values(trail[atTheJoin - 1]!.record.lanes ?? {}).map((lane) => trail[atTheJoin - 1]!.record.calls![lane.call]!.state)).toEqual(["DONE", "DONE", "DONE"]);
    expect(record.lanes).toEqual({
      TASK_A: { call: "PLAN-1/TASK_A#1", end: "DONE", output: { did: "write" } },
      TASK_B: { call: "PLAN-1/TASK_B#1", end: "DONE", output: { did: "review" } },
      TASK_C: { call: "PLAN-1/TASK_C#1", end: "DONE", output: { did: "test" } },
    });
    expect((record as PlanRecord).done).toEqual(["write", "review", "test"]);
    expect(record.history.map((step) => `${step.from}>${step.to}`)).toEqual(["PLANNED>split", "split>merge", "merge>INTEGRATED"]);
  });

  it("conforms to the machine as a whole, every arrow of its own walked, the lanes' included", async () => {
    let answered = false;
    const { workflow, runtime } = await mounted([planner(task([], () => answered), [["write", 1], ["ask", 1], ["test", 1]])]);

    const findings = await conformance(workflow, {
      runtime: () => runtime,
      worlds: [
        { name: "a plan whose lanes all finish", workId: "PLAN-1", meanwhile: [() => { answered = true; }] },
        {
          name: "a plan with a lane that declines",
          start: (now) => ({ ...runtime.newRecord("PLAN-2", now), tasks: [["write", 1], ["decline", 0], ["test", 1]] }) as PlanRecord,
        },
        {
          name: "a plan whose outer lanes decline",
          start: (now) => ({ ...runtime.newRecord("PLAN-3", now), tasks: [["decline", 0], ["write", 1], ["decline", 0]] }) as PlanRecord,
        },
      ],
      everyEdge: true,
    });

    // The arrows inside a lane are the callee's to walk, and these worlds
    // only send one lane to its owner and one to a refusal.
    expect(findings.filter((finding) => !/`TASK_[AC]\//.test(finding.message))).toEqual([]);
  });

  it("tells one end of a lane from another, though both lead to the one join", async () => {
    const { workflow, runtime } = await mounted([planner(task([]), [["write", 1], ["decline", 0], ["test", 1]])]);

    const findings = await conformance(workflow, { runtime: () => runtime, worlds: [{ name: "a plan", workId: "PLAN-1" }], everyEdge: true });

    const messages = findings.map((finding) => finding.message);
    expect(messages).toContain("`TASK_A` → `merge` (`DECLINED`) is drawn, and no world walks it");
    expect(messages).toContain("`TASK_B` → `merge` (`DONE`) is drawn, and no world walks it");
    expect(messages).not.toContain("`TASK_A` → `merge` (`DONE`) is drawn, and no world walks it");
  });
});

describe("lanes drawn inside a workflow that is called", () => {
  it("are walked like the root's, every end told apart", async () => {
    const outer = withDiagram(defineWorkflow({
      name: "outer",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { PLAN: call(planner(task([]), [["write", 1], ["review", 1], ["test", 1]]) as never) },
      decide: { DONE: () => settled("done"), STOPPED: () => settled("stopped") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> PLAN\nPLAN --> DONE: INTEGRATED\nPLAN --> STOPPED: ESCALATED\nDONE --> [*]\nSTOPPED --> [*]\nclass PLAN call\n");
    const { workflow, runtime } = await mounted([outer]);

    const findings = await conformance(workflow, { runtime: () => runtime, worlds: [{ name: "a plan", workId: "PLAN-1" }], everyEdge: true });

    const messages = findings.map((finding) => finding.message);
    // Walked: into every lane, and out of every lane at DONE.
    for (const lane of ["TASK_A", "TASK_B", "TASK_C"]) {
      expect(messages).not.toContain(`\`PLAN/split\` → \`PLAN/${lane}\` is drawn, and no world walks it`);
      expect(messages).not.toContain(`\`PLAN/${lane}\` → \`PLAN/merge\` (\`DONE\`) is drawn, and no world walks it`);
    }
    // Not walked, and said so by its end: no lane declined.
    expect(messages).toContain("`PLAN/TASK_A` → `PLAN/merge` (`DECLINED`) is drawn, and no world walks it");
  });
});

describe("a lane that escalates", () => {
  it("leaves its siblings running, and the caller waits in the join saying which lane needs the person", async () => {
    const seen: Seen = [];
    let answered = false;
    const { workflow, runtime } = await mounted([planner(task(seen, () => answered), [["write", 2], ["ask", 1], ["test", 2]])]);

    const stopped = await walk(workflow, runtime, runtime.newRecord("PLAN-1", HOST.now()));

    // Its siblings ran to their ends while it waited on its owner.
    expect(seen).toEqual(["write", "test", "write", "test"]);
    const record = stopped.record;
    expect(record.state).toBe("split");
    expect(record.calls!["PLAN-1/TASK_A#1"]!.state).toBe("DONE");
    expect(record.calls!["PLAN-1/TASK_B#1"]!.state).toBe("ASKED");
    expect(record.calls!["PLAN-1/TASK_C#1"]!.state).toBe("DONE");
    expect(stopped.trail.at(-1)!.why).toBe("every lane of split waits — 2 of 3 arrived (TASK_A, TASK_C); TASK_B needs the person in ASKED");
    expect(callStanding(workflow, record)).toMatchObject({ attention: true, waiting: true });
    expect(laneStanding(workflow, record).map((lane) => [lane.lane, lane.ended, lane.attention])).toEqual([
      ["TASK_A", true, false],
      ["TASK_B", false, true],
      ["TASK_C", true, false],
    ]);

    answered = true;
    const resumed = await walk(workflow, runtime, record);

    expect(resumed.record.state).toBe("INTEGRATED");
    expect(seen).toEqual(["write", "test", "write", "test", "ask"]);
  });

  it("says which lane needs the person when the escalation is inside a call that lane made", async () => {
    // Each lane's workflow calls the task, so the task that asks is two records deep.
    const wrapper = withDiagram(defineWorkflow({
      name: "wrapper",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      input: {
        task: { type: "string", required: true, description: "what this lane does" },
        looks: { type: "number", required: true, description: "how many looks the work takes" },
      },
      output: { DONE: () => ({ did: "wrapped" }) },
      calls: { X: call(task([]), { input: (work: WorkRecord) => work.input as { task: string; looks: number } }) },
      decide: { DONE: () => settled("done"), DECLINED: () => settled("declined") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> X\nX --> DONE: DONE\nX --> DECLINED: DECLINED\nDONE --> [*]\nDECLINED --> [*]\nclass X call\n");
    const { workflow, runtime } = await mounted([planner(wrapper as never, [["ask", 1], ["ask", 1], ["ask", 1]])]);

    const { trail } = await walk(workflow, runtime, runtime.newRecord("PLAN-1", HOST.now()));

    const why = trail.at(-1)!.why;
    expect(why).toMatch(/^every lane of split waits — 0 of 3 arrived/);
    for (const lane of ["TASK_A", "TASK_B", "TASK_C"]) expect(why).toContain(`${lane} needs the person in X`);
  });
});
