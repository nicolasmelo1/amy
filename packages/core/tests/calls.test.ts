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
  Call,
  call,
  callPath,
  callStanding,
  defineWorkflow,
  implementationOf,
  mount,
  movedBy,
  port,
  runAction,
  settled,
  withDiagram,
} from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-30T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

const NO_SETTINGS = {} satisfies ConfigSchema;

interface Forge {
  open(): number;
  findRenamed?(): number | null;
}

/** A callee with an input, two ends and a return value at one of them. */
function opener(options: { needs?: "forge" | "none"; writes?: readonly string[] } = {}) {
  type Record = WorkRecord & { state: "OPENING" | "OPENED" | "REFUSED"; input: { branch: string }; opened?: number };
  return withDiagram(defineWorkflow({
    name: "opener",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: options.needs === "none" ? {} : { forge: port<Forge>() },
    codeHostWrites: options.writes ?? [],
    input: { branch: { type: "string", required: true, description: "the branch to open from" } },
    output: { OPENED: (record: Record) => ({ number: record.opened ?? 0 }) },
    decide: {
      OPENING: (record: Record) => (record.opened ? advance("OPENED", "opened") : act("open it", { type: "open" })),
      OPENED: () => settled("opened"),
      REFUSED: () => settled("refused"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: { open: async (scope, work) => { work.outcomes.opened = (scope.ports as { forge?: Forge }).forge?.open() ?? 7; } },
    remember: (_scope, record: Record, outcomes) => (typeof outcomes.opened === "number" ? { ...record, opened: outcomes.opened } : record),
  }), `stateDiagram-v2
    [*] --> OPENING
    OPENING --> OPENED
    OPENING --> REFUSED
    OPENED --> [*]
    REFUSED --> [*]
`);
}

type CallerRecord = WorkRecord & { state: "WORKING" | "PR" | "DONE" | "DECLINED"; number?: number };

/** A caller whose diagram, decisions and binding a test may each get wrong in one place. */
function caller(options: {
  diagram?: string;
  calls?: Record<string, Call>;
  decide?: Record<string, (record: CallerRecord) => ReturnType<typeof settled>>;
  writes?: readonly string[];
} = {}): Plugin {
  const callee = opener({ writes: options.writes === undefined ? [] : ["open-pull-request"] });
  return withDiagram(defineWorkflow({
    name: "caller",
    configSchema: NO_SETTINGS,
    policy: {},
    needs: {},
    codeHostWrites: options.writes ?? [],
    calls: options.calls ?? {
      PR: call(callee, {
        input: () => ({ branch: "amy/one" }),
        output: { OPENED: (work: CallerRecord, out) => ({ ...work, number: out.number }) },
      }),
    },
    decide: options.decide ?? {
      WORKING: () => advance("PR", "the work is done"),
      DONE: () => settled("done"),
      DECLINED: () => settled("declined"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
  }), options.diagram ?? `stateDiagram-v2
    [*] --> WORKING
    WORKING --> PR
    state "open it · opener" as PR
    PR --> DONE: OPENED
    PR --> DECLINED: REFUSED
    DONE --> [*]
    DECLINED --> [*]
    class PR call
`);
}

const forge: Plugin = { name: "forge", register: (registry) => registry.port("forge", { open: () => 42 } satisfies Forge) };

async function refusal(plugins: readonly Plugin[]): Promise<string> {
  const outcome = await mount(plugins, {}, HOST);
  if (outcome.ok) throw new Error("the mount was expected to refuse");
  return outcome.problems.join("; ");
}

async function mounted(plugins: readonly Plugin[], config: Record<string, unknown> = {}): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const outcome = await mount(plugins, config, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

/** Looks the way the engine does, until the work settles. */
async function walk(workflow: Workflow, runtime: WorkflowRuntime, id = "W-1"): Promise<WorkRecord> {
  let record = runtime.newRecord(id, HOST.now());
  for (let look = 0; look < 50; look += 1) {
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    if (plan.kind === "settled") return record;
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
    }
    record = runtime.apply(applyPlan(record, plan, HOST.now(), outcomes), plan, outcomes, observation, HOST.now(), movedBy(record, plan));
  }
  throw new Error(`did not settle; last in ${record.state}`);
}

describe("a call is refused at boot, by name and call path", () => {
  it("refuses a call state with no `calls` entry", async () => {
    expect(await refusal([caller({ calls: {} }), forge])).toContain(
      "caller: `PR` is a call state with no `calls` entry — bind it with `PR: call(workflow)`",
    );
  });

  it("refuses a callee's end with no edge out of the call state named for it", async () => {
    const diagram = `stateDiagram-v2
    [*] --> WORKING
    WORKING --> PR
    PR --> DONE: OPENED
    DONE --> [*]
    DECLINED --> [*]
    WORKING --> DECLINED
    class PR call
`;
    expect(await refusal([caller({ diagram }), forge])).toContain(
      "caller → PR: opener can end at `REFUSED`, and no edge out of `PR` is named `REFUSED` — draw `PR --> SOMEWHERE: REFUSED`",
    );
  });

  it("refuses an edge out of a call state that is named for no end of the callee", async () => {
    const diagram = `stateDiagram-v2
    [*] --> WORKING
    WORKING --> PR
    PR --> DONE: OPENED
    PR --> DECLINED: REFUSED
    PR --> WORKING: try again
    DONE --> [*]
    DECLINED --> [*]
    class PR call
`;
    expect(await refusal([caller({ diagram }), forge])).toContain(
      "caller → PR: `PR --> WORKING` is not named for an end of opener, which ends at `OPENED`, `REFUSED`",
    );
  });

  it("refuses an `output` for an end that returns nothing, and for one the callee does not have", async () => {
    const callee = opener();
    const nothing = caller({ calls: { PR: call(callee, { input: () => ({ branch: "b" }), output: { REFUSED: (work: CallerRecord) => work } as never }) } });
    const missing = caller({ calls: { PR: call(callee, { input: () => ({ branch: "b" }), output: { MERGED: (work: CallerRecord) => work } as never }) } });

    expect(await refusal([nothing, forge])).toContain(
      "caller → PR: `output.REFUSED` folds what opener returns at `REFUSED`, and it returns nothing there",
    );
    expect(await refusal([missing, forge])).toContain(
      "caller → PR: `output.MERGED` folds an end opener does not have; it ends at `OPENED`, `REFUSED`",
    );
  });

  it("refuses an `input` for a callee that takes none, and a call with none to a callee that needs one", async () => {
    const takesNone = withDiagram(defineWorkflow({
      name: "takes-none",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      decide: { ONLY: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> ONLY\nONLY --> [*]\n");
    const diagram = `stateDiagram-v2
    [*] --> WORKING
    WORKING --> PR
    PR --> DONE: ONLY
    DONE --> [*]
    DECLINED --> [*]
    WORKING --> DECLINED
    class PR call
`;

    expect(await refusal([caller({ diagram, calls: { PR: call(takesNone, { input: () => ({ branch: "b" }) as never }) } })])).toContain(
      "caller → PR: passes an `input`, and takes-none takes none",
    );
    expect(await refusal([caller({ calls: { PR: call(opener()) } }), forge])).toContain(
      "caller → PR: opener needs an `input` with `branch`, and the call passes none",
    );
  });

  it("refuses a callee's need that no mounted port satisfies, naming the whole call path", async () => {
    const leaf = opener();
    const middle = withDiagram(defineWorkflow({
      name: "review",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { FIX: call(leaf, { input: () => ({ branch: "b" }) }) },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> FIX\nFIX --> DONE: OPENED\nFIX --> DONE: REFUSED\nDONE --> [*]\nclass FIX call\n");
    const root = withDiagram(defineWorkflow({
      name: "oncall",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { REVIEW: call(middle) },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> REVIEW\nREVIEW --> DONE: DONE\nDONE --> [*]\nclass REVIEW call\n");

    expect(await refusal([root])).toContain("oncall → REVIEW → FIX: needs forge");
  });

  it("binds a callee's need to a port of another name, and refuses one bound to nothing", async () => {
    const strong: Plugin = { name: "strong", register: (registry) => registry.port("forge-strong", { open: () => 9 } satisfies Forge) };
    const bound = caller({ calls: { PR: call(opener(), { input: () => ({ branch: "b" }), ports: { forge: "forge-strong" }, output: { OPENED: (work: CallerRecord, out) => ({ ...work, number: out.number }) } }) } });
    const { workflow, runtime } = await mounted([bound, strong]);

    expect((await walk(workflow, runtime) as CallerRecord).number).toBe(9);
    expect(await refusal([bound, forge])).toContain("caller → PR: needs forge");
  });

  it("refuses a callee that needs a method its port only offers optionally, when the mounted one lacks it", async () => {
    const picky = withDiagram(defineWorkflow({
      name: "picky",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: { forge: port<Forge>({ requires: ["findRenamed"] }) },
      decide: { ONLY: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> ONLY\nONLY --> [*]\n");
    const diagram = "stateDiagram-v2\n[*] --> WORKING\nWORKING --> PR\nPR --> DONE: ONLY\nDONE --> [*]\nDECLINED --> [*]\nWORKING --> DECLINED\nclass PR call\n";

    expect(await refusal([caller({ diagram, calls: { PR: call(picky) } }), forge])).toContain(
      "caller → PR: needs forge to offer `findRenamed`, and the mounted one does not",
    );
  });

  it("refuses a decision written for a call state, and a binding for a state the diagram does not mark as a call", async () => {
    const decided = caller({
      decide: { WORKING: () => settled("x"), PR: () => settled("x"), DONE: () => settled("x"), DECLINED: () => settled("x") },
    });
    const unmarked = caller({
      diagram: "stateDiagram-v2\n[*] --> WORKING\nWORKING --> PR\nPR --> DONE\nPR --> DECLINED\nDONE --> [*]\nDECLINED --> [*]\n",
    });

    expect(await refusal([decided, forge])).toContain("`PR` is a call state, decided by the workflow called there");
    expect(await refusal([unmarked, forge])).toContain("caller: binds `calls.PR`, and its diagram does not mark `PR` as a call — add `class PR call`");
  });

  it("refuses a callee whose write claims exceed its caller's, naming the write", async () => {
    const outcome = await refusal([caller({ writes: [] }), forge].map((plugin, index) => (index === 0
      ? withDiagram(defineWorkflow({
        name: "caller",
        configSchema: NO_SETTINGS,
        policy: {},
        needs: {},
        calls: { PR: call(opener({ writes: ["open-pull-request"] }), { input: () => ({ branch: "b" }) }) },
        decide: { WORKING: () => advance("PR", "go"), DONE: () => settled("done"), DECLINED: () => settled("declined") },
        record: () => ({}),
        observe: async () => ({}),
        actions: {},
      }), "stateDiagram-v2\n[*] --> WORKING\nWORKING --> PR\nPR --> DONE: OPENED\nPR --> DECLINED: REFUSED\nDONE --> [*]\nDECLINED --> [*]\nclass PR call\n")
      : plugin)));

    expect(outcome).toContain("caller → PR: opener claims the code-host write `open-pull-request`, and caller does not claim it");
  });

  it("mounts a callee whose write claims fit inside its caller's", async () => {
    const { workflow } = await mounted([caller({ writes: ["open-pull-request"] }), forge]);

    expect(workflow.codeHostWrites).toEqual(["open-pull-request"]);
  });

  it("refuses a callee's settings its schema does not declare, at boot", async () => {
    const plugin = caller({ calls: { PR: call(opener(), { input: () => ({ branch: "b" }), config: { rounds: 3 } }) } });

    expect(await refusal([plugin, forge])).toContain("caller → PR: `rounds` is not a setting this plugin has");
  });
});

describe("a cycle of calls", () => {
  it("is refused at mount, at any depth, naming every workflow on it", async () => {
    const looping = (name: string, next: () => unknown): Plugin => withDiagram(defineWorkflow({
      name,
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { CALL: call(next as () => object) },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> CALL\nCALL --> DONE: DONE\nDONE --> [*]\nclass CALL call\n");
    const workflows: Record<string, Plugin> = {};
    workflows.review = looping("review", () => workflows.fix);
    workflows.fix = looping("fix", () => workflows.triage);
    workflows.triage = looping("triage", () => workflows.review);

    expect(await refusal([workflows.review])).toContain("a cycle of calls: review → fix → triage → review");
  });
});

describe("the smallest call", () => {
  it("mounts and runs `call(callee)` for a callee that takes, needs and returns nothing", async () => {
    const quiet = withDiagram(defineWorkflow({
      name: "quiet",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      decide: { THINKING: () => advance("THOUGHT", "thought"), THOUGHT: () => settled("thought") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> THINKING\nTHINKING --> THOUGHT\nTHOUGHT --> [*]\n");
    const root = withDiagram(defineWorkflow({
      name: "root",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { THINK: call(quiet) },
      decide: { START: () => advance("THINK", "go"), DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> START\nSTART --> THINK\nTHINK --> DONE: THOUGHT\nDONE --> [*]\nclass THINK call\n");
    const { workflow, runtime } = await mounted([root]);

    const record = await walk(workflow, runtime);

    expect(record.state).toBe("DONE");
    expect(Object.keys(record.calls ?? {})).toEqual(["W-1/THINK#1"]);
    expect(record.calls!["W-1/THINK#1"]!.state).toBe("THOUGHT");
    expect(record.calling).toBeUndefined();
  });

  it("starts the call at once when the workflow's first state is a call", async () => {
    const { runtime } = await mounted([withDiagram(defineWorkflow({
      name: "starts-calling",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { OPEN: call(opener({ needs: "none" }), { input: () => ({ branch: "amy/first" }) }) },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> OPEN\nOPEN --> DONE: OPENED\nOPEN --> DONE: REFUSED\nDONE --> [*]\nclass OPEN call\n")]);

    const record = runtime.newRecord("W-2", HOST.now());

    expect(callPath(record).map((step) => `${step.id}@${step.state}`)).toEqual(["W-2@OPEN", "W-2/OPEN#1@OPENING"]);
    expect(record.calls!["W-2/OPEN#1"]!.input).toEqual({ branch: "amy/first" });
  });

  it("folds what the callee returned into its caller, which takes the edge named for the end", async () => {
    const { workflow, runtime } = await mounted([caller(), forge]);

    const record = await walk(workflow, runtime) as CallerRecord;

    expect(record.state).toBe("DONE");
    expect(record.number).toBe(42);
    expect(record.history.map((step) => `${step.from}>${step.to}`)).toEqual(["WORKING>PR", "PR>DONE"]);
    expect(record.attempts).toEqual({});
    expect(record.calls!["W-1/PR#1"]!.attempts).toEqual({ OPENING: 1 });
  });
});

describe("the edge out of a call", () => {
  type Told = CallerRecord & { told?: string[] };
  function telling(effects: Record<string, unknown>): Plugin {
    return withDiagram(defineWorkflow({
      name: "caller",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { PR: call(opener(), { input: () => ({ branch: "amy/one" }), effects: effects as never }) },
      decide: { WORKING: () => advance("PR", "go"), DONE: () => settled("done"), DECLINED: () => settled("declined") },
      record: () => ({}),
      observe: async () => ({}),
      actions: { say: async (_scope, work, effect) => { work.outcomes.said = String(effect.text); } },
      remember: (_scope, record: Told, outcomes) => (typeof outcomes.said === "string" ? { ...record, told: [...(record.told ?? []), outcomes.said] } : record),
    }), "stateDiagram-v2\n[*] --> WORKING\nWORKING --> PR\nPR --> DONE: OPENED\nPR --> DECLINED: REFUSED\nDONE --> [*]\nDECLINED --> [*]\nclass PR call\n");
  }

  it("carries the caller's effects for the end reached, run as the caller's own actions", async () => {
    const plugin = telling({ OPENED: (_work: Told, out: { number: number }) => [{ type: "say", text: `opened #${out.number}` }] });
    const { workflow, runtime } = await mounted([plugin, forge]);

    const record = await walk(workflow, runtime) as Told;

    expect(record.state).toBe("DONE");
    expect(record.told).toEqual(["opened #42"]);
  });

  it("refuses effects for an end the callee does not have", async () => {
    expect(await refusal([telling({ MERGED: () => [] }), forge])).toContain(
      "caller → PR: `effects.MERGED` is for an end opener does not have; it ends at `OPENED`, `REFUSED`",
    );
  });
});

describe("a record saved in a call state before it held a call", () => {
  it("makes its call on its next look, rather than failing", async () => {
    const { workflow, runtime } = await mounted([caller(), forge]);
    // What an install that upgraded mid-flight has on disk.
    let record: WorkRecord = { id: "W-9", state: "PR", updatedAt: "", attempts: {}, history: [] };

    for (let look = 0; look < 10 && record.state === "PR"; look += 1) {
      const observation = await runtime.observe(record);
      const plan = workflow.plan(record, observation, runtime.policy);
      const outcomes: Record<string, unknown> = {};
      for (const action of actionsOf(plan)) {
        await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
      }
      record = runtime.apply(applyPlan(record, plan, HOST.now(), outcomes), plan, outcomes, observation, HOST.now(), movedBy(record, plan));
    }

    expect(record.state).toBe("DONE");
    expect(Object.keys(record.calls ?? {})).toEqual(["W-9/PR#1"]);
  });
});

describe("where work stands through its calls", () => {
  it("is the root's attention when the deepest record waits on its owner", async () => {
    const asks = withDiagram(defineWorkflow({
      name: "asks",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      decide: { ASKING: () => advance("ASKED", "nobody can decide this but the owner"), ASKED: () => settled("waiting"), ANSWERED: () => settled("answered") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> ASKING\nASKING --> ASKED\nASKED --> ANSWERED\nANSWERED --> [*]\nclass ASKED attention\n");
    const root = withDiagram(defineWorkflow({
      name: "root",
      configSchema: NO_SETTINGS,
      policy: {},
      needs: {},
      calls: { ASK: call(asks) },
      decide: { DONE: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), "stateDiagram-v2\n[*] --> ASK\nASK --> DONE: ANSWERED\nDONE --> [*]\nclass ASK call\n");
    const { workflow, runtime } = await mounted([root]);

    const before = runtime.newRecord("W-3", HOST.now());
    const after = await walk(workflow, runtime, "W-3");

    expect(callStanding(workflow, before)).toMatchObject({ attention: false });
    const standing = callStanding(workflow, after);
    expect(standing.attention).toBe(true);
    expect(standing.path.map((step) => `${step.workflow.name}:${step.record.id}@${step.record.state}`)).toEqual(["root:W-3@ASK", "asks:W-3/ASK#1@ASKED"]);
  });
});
