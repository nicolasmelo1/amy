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
  defineWorkflow,
  implementationOf,
  mount,
  movedBy,
  runAction,
  settled,
  withDiagram,
} from "@amykit/core";
import { conformance } from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-30T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

const NO_SETTINGS = {} satisfies ConfigSchema;

/** Every look each workflow's own `observe` was asked for, by workflow and state. */
type Looked = string[];

async function mounted(plugins: readonly Plugin[]): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const outcome = await mount(plugins, {}, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

/** One look, as the engine takes it. */
async function look(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord): Promise<WorkRecord | undefined> {
  const observation = await runtime.observe(record);
  const plan = workflow.plan(record, observation, runtime.policy);
  if (plan.kind === "settled") return undefined;
  const outcomes: Record<string, unknown> = {};
  for (const action of actionsOf(plan)) {
    await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
  }
  return runtime.apply(applyPlan(record, plan, HOST.now(), outcomes), plan, outcomes, observation, HOST.now(), movedBy(record, plan));
}

async function walk(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, until: (record: WorkRecord) => boolean = () => false): Promise<WorkRecord> {
  let current = record;
  for (let count = 0; count < 100; count += 1) {
    if (until(current)) return current;
    const next = await look(workflow, runtime, current);
    if (!next) return current;
    current = next;
  }
  throw new Error(`did not settle; last in ${current.state}`);
}

describe("a caller that enters the same call state twice", () => {
  type ReviewRecord = WorkRecord & { state: "READING" | "APPROVED" | "CHANGES"; input: { round: number }; read?: number };
  type PullRecord = WorkRecord & { state: "WORKING" | "REVIEW" | "FIX" | "DONE"; rounds?: number; verdicts?: string[] };

  const review = withDiagram(defineWorkflow({
    name: "review",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    input: { round: { type: "number", required: true, description: "which round of review this is" } },
    output: {
      APPROVED: (record: ReviewRecord) => ({ verdict: `approved in round ${record.input.round}` }),
      CHANGES: (record: ReviewRecord) => ({ verdict: `changes in round ${record.input.round}` }),
    },
    decide: {
      // Two looks to read, so a restart can land between them.
      READING: (record: ReviewRecord) => {
        if ((record.read ?? 0) < 2) return act("reading", { type: "read" });
        return record.input.round === 1 ? advance("CHANGES", "needs changes") : advance("APPROVED", "looks good");
      },
      APPROVED: () => settled("approved"),
      CHANGES: () => settled("changes asked"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: { read: async (_scope, work) => { work.outcomes.read = true; } },
    remember: (_scope, record: ReviewRecord, outcomes) => (outcomes.read ? { ...record, read: (record.read ?? 0) + 1 } : record),
  }), "stateDiagram-v2\n[*] --> READING\nREADING --> APPROVED\nREADING --> CHANGES\nAPPROVED --> [*]\nCHANGES --> [*]\n");

  const pull = (): Plugin => withDiagram(defineWorkflow({
    name: "pull",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    calls: {
      REVIEW: call(review, {
        input: (work: PullRecord) => ({ round: (work.rounds ?? 0) + 1 }),
        output: {
          APPROVED: (work: PullRecord, out) => ({ ...work, rounds: (work.rounds ?? 0) + 1, verdicts: [...(work.verdicts ?? []), out.verdict] }),
          CHANGES: (work: PullRecord, out) => ({ ...work, rounds: (work.rounds ?? 0) + 1, verdicts: [...(work.verdicts ?? []), out.verdict] }),
        },
      }),
    },
    decide: {
      WORKING: () => advance("REVIEW", "ready for review"),
      FIX: () => advance("REVIEW", "fixed"),
      DONE: () => settled("merged"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
  }), `stateDiagram-v2
    [*] --> WORKING
    WORKING --> REVIEW
    REVIEW --> FIX: CHANGES
    FIX --> REVIEW
    REVIEW --> DONE: APPROVED
    DONE --> [*]
    class REVIEW call
`);

  it("gets two callee records, each with its own history and output", async () => {
    const { workflow, runtime } = await mounted([pull()]);

    const record = await walk(workflow, runtime, runtime.newRecord("TBO-1", HOST.now())) as PullRecord;

    expect(record.state).toBe("DONE");
    expect(Object.keys(record.calls ?? {})).toEqual(["TBO-1/REVIEW#1", "TBO-1/REVIEW#2"]);
    const [first, second] = [record.calls!["TBO-1/REVIEW#1"]!, record.calls!["TBO-1/REVIEW#2"]!];
    expect(first.history.map((step) => step.to)).toEqual(["CHANGES"]);
    expect(second.history.map((step) => step.to)).toEqual(["APPROVED"]);
    expect(first.input).toEqual({ round: 1 });
    expect(second.input).toEqual({ round: 2 });
    expect(record.verdicts).toEqual(["changes in round 1", "approved in round 2"]);
    expect(record.history.map((step) => `${step.from}>${step.to}`)).toEqual(["WORKING>REVIEW", "REVIEW>FIX", "FIX>REVIEW", "REVIEW>DONE"]);
  });

  it("resumes #2 after a restart during it, rather than starting #3", async () => {
    const before = await mounted([pull()]);
    const midway = await walk(before.workflow, before.runtime, before.runtime.newRecord("TBO-1", HOST.now()), (record) =>
      record.calling === "TBO-1/REVIEW#2" && (record.calls!["TBO-1/REVIEW#2"] as ReviewRecord).read === 1);

    // What a store hands back after the process that held the record is gone.
    const saved = JSON.parse(JSON.stringify(midway)) as WorkRecord;
    const after = await mounted([pull()]);
    const record = await walk(after.workflow, after.runtime, saved);

    expect(record.state).toBe("DONE");
    expect(Object.keys(record.calls ?? {})).toEqual(["TBO-1/REVIEW#1", "TBO-1/REVIEW#2"]);
    expect((record.calls!["TBO-1/REVIEW#2"] as ReviewRecord).read).toBe(2);
  });
});

describe("a call three deep", () => {
  type Leaf = WorkRecord & { state: "OPENING" | "OPENED"; input: { branch: string }; number?: number };
  type Middle = WorkRecord & { state: "FIX" | "FIXED"; number?: number };
  type Root = WorkRecord & { state: "PAGED" | "REVIEW" | "RESOLVED"; number?: number };

  function tree(looked: Looked): Plugin {
    const leaf = withDiagram(defineWorkflow({
      name: "open",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      input: { branch: { type: "string", required: true, description: "where the change is" } },
      output: { OPENED: (record: Leaf) => ({ number: record.number ?? 0 }) },
      decide: {
        OPENING: (record: Leaf) => (record.number === undefined ? act("open it", { type: "open" }) : advance("OPENED", "opened")),
        OPENED: () => settled("opened"),
      },
      record: () => ({}),
      observe: async (_scope, record) => { looked.push(`open@${record.state}`); return {}; },
      actions: { open: async (_scope, work) => { work.outcomes.number = 31; } },
      remember: (_scope, record: Leaf, outcomes) => (typeof outcomes.number === "number" ? { ...record, number: outcomes.number } : record),
    }), "stateDiagram-v2\n[*] --> OPENING\nOPENING --> OPENED\nOPENED --> [*]\n");

    const middle = withDiagram(defineWorkflow({
      name: "fix",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      output: { FIXED: (record: Middle) => ({ number: record.number ?? 0 }) },
      calls: { FIX: call(leaf, { input: () => ({ branch: "amy/fix" }), output: { OPENED: (work: Middle, out) => ({ ...work, number: out.number }) } }) },
      decide: { FIXED: () => settled("fixed") },
      record: () => ({}),
      observe: async (_scope, record) => { looked.push(`fix@${record.state}`); return {}; },
      actions: {},
    }), "stateDiagram-v2\n[*] --> FIX\nFIX --> FIXED: OPENED\nFIXED --> [*]\nclass FIX call\n");

    return withDiagram(defineWorkflow({
      name: "oncall",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { REVIEW: call(middle, { output: { FIXED: (work: Root, out) => ({ ...work, number: out.number }) } }) },
      decide: { PAGED: () => advance("REVIEW", "paged"), RESOLVED: () => settled("resolved") },
      record: () => ({}),
      observe: async (_scope, record) => { looked.push(`oncall@${record.state}`); return {}; },
      actions: {},
    }), "stateDiagram-v2\n[*] --> PAGED\nPAGED --> REVIEW\nREVIEW --> RESOLVED: FIXED\nRESOLVED --> [*]\nclass REVIEW call\n");
  }

  it("runs to the end: the callers wait unobserved, take the edge named for the end, and hold the output", async () => {
    const looked: Looked = [];
    const { workflow, runtime } = await mounted([tree(looked)]);

    const record = await walk(workflow, runtime, runtime.newRecord("PAGE-1", HOST.now())) as Root;

    expect(record.state).toBe("RESOLVED");
    expect(record.number).toBe(31);
    const middle = record.calls!["PAGE-1/REVIEW#1"]!;
    expect(middle.state).toBe("FIXED");
    expect(middle.calls!["PAGE-1/REVIEW#1/FIX#1"]!.state).toBe("OPENED");
    // While a call runs, the deepest record is the only one anybody looks at:
    // each caller is looked at again once, when its child has ended, to return.
    expect(looked).toEqual(["oncall@PAGED", "open@OPENING", "open@OPENING", "fix@FIX", "oncall@REVIEW", "oncall@RESOLVED"]);
  });

  it("conforms to the machine as a whole, every drawn edge walked", async () => {
    const { workflow, runtime } = await mounted([tree([])]);

    const findings = await conformance(workflow, {
      runtime: () => runtime,
      worlds: [{ name: "a page that is fixed", workId: "PAGE-1" }],
      everyEdge: true,
    });

    expect(findings).toEqual([]);
  });
});

describe("one callee called from two sites", () => {
  type Counter = WorkRecord & { state: "COUNTING" | "COUNTED"; count?: number };
  type Twice = WorkRecord & { state: "FIRST" | "SECOND" | "DONE"; first?: number; second?: number };

  const counter = withDiagram(defineWorkflow({
    name: "counter",
    configSchema: { limit: { type: "number", default: 1, description: "how many to count before stopping" } } satisfies ConfigSchema,
    policy: {},
    needs: {},
    output: { COUNTED: (record: Counter) => ({ count: record.count ?? 0 }) },
    decide: {
      COUNTING: (record: Counter, observation: { limit: number }) =>
        (record.count ?? 0) >= observation.limit ? advance("COUNTED", "counted") : act("one more", { type: "count" }),
      COUNTED: () => settled("counted"),
    },
    record: () => ({}),
    observe: async (scope) => ({ limit: scope.config.limit }),
    actions: { count: async (_scope, work) => { work.outcomes.counted = true; } },
    remember: (_scope, record: Counter, outcomes) => (outcomes.counted ? { ...record, count: (record.count ?? 0) + 1 } : record),
  }), "stateDiagram-v2\n[*] --> COUNTING\nCOUNTING --> COUNTED\nCOUNTED --> [*]\n");

  it("behaves according to each call site's config", async () => {
    const twice = withDiagram(defineWorkflow({
      name: "twice",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: {
        FIRST: call(counter, { config: { limit: 1 }, output: { COUNTED: (work: Twice, out) => ({ ...work, first: out.count }) } }),
        SECOND: call(counter, { config: { limit: 3 }, output: { COUNTED: (work: Twice, out) => ({ ...work, second: out.count }) } }),
      },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> FIRST\nFIRST --> SECOND: COUNTED\nSECOND --> DONE: COUNTED\nDONE --> [*]\nclass FIRST,SECOND call\n");
    const { workflow, runtime } = await mounted([twice]);

    const record = await walk(workflow, runtime, runtime.newRecord("T-1", HOST.now())) as Twice;

    expect(record.state).toBe("DONE");
    expect([record.first, record.second]).toEqual([1, 3]);
  });
});
