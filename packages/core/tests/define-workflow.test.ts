import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigSchema,
  HostServices,
  Plugin,
  Plan,
  WorkRecord,
  WorkflowRuntime,
  WorkflowRuntimeParts,
  Workflow,
  defineWorkflow,
  mount,
  notWritten,
  notWrittenIn,
  optional,
  planning,
  port,
  WORKFLOW_RUNTIME,
  withDiagram,
  workflowActions,
  act,
  advance,
  settled,
  wait,
} from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-29T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

interface TestRecord extends WorkRecord {
  state: "NEW" | "DONE";
  customer: string;
}

interface Policy {
  attempts: number;
  backoffMs: number;
}

interface RequiredPort { read(): string }
interface OptionalPort { notify(): void }

const schema = {
  policy: { type: "record", description: "workflow policy", default: {} },
} satisfies ConfigSchema;

function workflow(seen: { optional?: OptionalPort; policy?: Policy } = {}) {
  return defineWorkflow({
    name: "example",
    configSchema: schema,
    states: ["NEW", "DONE"],
    waiting: [],
    terminal: ["DONE"],
    policy: { attempts: 3, backoffMs: 1000 } satisfies Policy,
    needs: { source: port<RequiredPort>(), notifier: optional<OptionalPort>() },
    plan: () => ({ kind: "settled", why: "done" }),
    record: (workId) => ({ customer: workId }),
    runtime: ({ ports, policy }) => {
      seen.optional = ports.notifier;
      seen.policy = policy;
      return {
        found: async () => [],
        observe: async () => ({}),
        actions: {},
        apply: (record) => record,
      };
    },
  });
}

const source: Plugin = {
  name: "source",
  register: (registry) => registry.port("source", { read: () => "value" }),
};

describe("defineWorkflow", () => {
  it("registers the workflow and deferred runtime together", async () => {
    const outcome = await mount([workflow(), source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow?.name).toBe("example");
    expect(outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.has("example")).toBe(true);
  });

  it("refuses a missing required port by workflow and port, after registration", async () => {
    const outcome = await mount([workflow()], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems).toContain(
      "workflow-example: failed to mount — the example workflow needs the `source` port, and nothing mounted it",
    );
  });

  it("hands an absent optional port to the runtime as undefined", async () => {
    const seen: { optional?: OptionalPort } = {};
    const outcome = await mount([workflow(seen), source], {}, HOST);

    expect(outcome.ok).toBe(true);
    expect(seen).toHaveProperty("optional", undefined);
  });

  it("merges policy defaults and keeps a default left out", async () => {
    const seen: { policy?: Policy } = {};
    const plugin = workflow(seen);
    const outcome = await mount(
      [plugin, source],
      { [plugin.name]: { policy: { attempts: 7 } } },
      HOST,
    );

    expect(outcome.ok).toBe(true);
    expect(seen.policy).toEqual({ attempts: 7, backoffMs: 1000 });
  });

  it("refuses an undeclared policy key by name at boot", async () => {
    const plugin = workflow();
    const outcome = await mount(
      [plugin, source],
      { [plugin.name]: { policy: { attemptz: 7 } } },
      HOST,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("example policy.attemptz is not declared");
  });

  it("constructs records with the five core fields and only the declared domain fields", async () => {
    const outcome = await mount([workflow(), source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("example") as WorkflowRuntime<TestRecord>;

    expect(runtime.newRecord("C-1", HOST.now())).toEqual({
      id: "C-1",
      state: "NEW",
      updatedAt: "2026-10-29T12:00:00.000Z",
      attempts: {},
      history: [],
      customer: "C-1",
    });
  });

  // A claim that reads a required setting has no configuration to read until
  // the host supplies one. Reading it at import would throw for a workflow
  // whose config is valid; the mount rebuilds the declaration with its own
  // config, and that is the workflow it registers.
  it("evaluates a configuration-dependent claim only where a configuration exists", async () => {
    const declared = defineWorkflow({
      name: "claimed",
      configSchema: {
        repos: { type: "string[]", required: true, description: "the repositories this workflow works in" },
        policy: { type: "record", description: "workflow policy", default: {} },
      } satisfies ConfigSchema,
      states: ["NEW"],
      waiting: [],
      terminal: ["NEW"],
      policy: { attempts: 3 },
      needs: { source: port<RequiredPort>() },
      trackerWrites: ({ config }) => (config.repos.includes("acme/widgets") ? ["comment"] : []),
      plan: () => ({ kind: "settled", why: "done" }),
      record: () => ({}),
      runtime: () => ({
        found: async () => [],
        observe: async () => ({}),
        actions: {},
        apply: (record) => record,
      }),
    });

    expect(declared.workflow.trackerWrites).toEqual([]);

    const outcome = await mount([declared, source], { [declared.name]: { repos: ["acme/widgets"] } }, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow?.trackerWrites).toEqual(["comment"]);
  });
  // Members are delegated to the object the factory returned, so a runtime
  // built as a class keeps its prototype methods — and `this` — after mount.
  it("keeps the methods of a runtime built as a class", async () => {
    class ClassRuntime implements WorkflowRuntimeParts<TestRecord, unknown> {
      readonly actions = {};
      #looks: string[] = [];

      async found(): Promise<readonly string[]> {
        this.#looks.push("found");
        return ["C-1"];
      }

      async observe(): Promise<unknown> {
        return {};
      }

      apply(record: TestRecord): TestRecord {
        return record;
      }
    }

    const declared = defineWorkflow({
      name: "classy",
      configSchema: schema,
      states: ["NEW"],
      waiting: [],
      terminal: ["NEW"],
      policy: { attempts: 3 },
      needs: { source: port<RequiredPort>() },
      plan: () => ({ kind: "settled", why: "done" }),
      record: (workId) => ({ customer: workId }),
      runtime: () => new ClassRuntime(),
    });
    const outcome = await mount([declared, source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("classy") as WorkflowRuntime<TestRecord>;

    await expect(runtime.found()).resolves.toEqual(["C-1"]);
  });
});

describe("a workflow in three pieces", () => {
  const diagram = `stateDiagram-v2
    [*] --> NEW
    NEW --> DONE
    DONE --> [*]
`;

  const pieceNeeds = { source: port<RequiredPort>() };
  type PieceDecision = (record: TestRecord, observation: { value: string }, policy: { attempts: number }) => ReturnType<Workflow["plan"]>;
  type PieceOverrides = Partial<{
    decide: Readonly<Record<string, PieceDecision>>;
    before: (record: TestRecord, observation: { value: string }, policy: { attempts: number }) => Plan | undefined;
    after: (decision: ReturnType<Workflow["plan"]>, record: TestRecord, observation: { value: string }, policy: { attempts: number }) => ReturnType<Workflow["plan"]>;
    extend: NonNullable<Parameters<Plugin["register"]>[0]> extends infer _Registry
      ? (registry: Parameters<Plugin["register"]>[0]) => void
      : never;
  }>;

  function pieces(overrides: PieceOverrides = {}) {
    return withDiagram(defineWorkflow<typeof schema, readonly [string, ...string[]], { attempts: number }, typeof pieceNeeds, TestRecord, { value: string }>({
      name: "pieces",
      configSchema: schema,
      policy: { attempts: 3 },
      needs: pieceNeeds,
      decide: {
        NEW: () => ({ kind: "advance", to: "DONE", effects: [], why: "decided" }),
        DONE: () => ({ kind: "settled", why: "done" }),
      },
      record: (workId) => ({ customer: workId }),
      discover: async ({ ports }) => [ports.source.read()],
      observe: async ({ ports }, _record) => ({ value: ports.source.read() }),
      actions: {},
      remember: (_scope, record) => ({ ...record, customer: `${record.customer}!` }),
      ...overrides,
    }), diagram);
  }

  it("refuses missing and extra decision state names at boot", async () => {
    const missing = pieces({ decide: { NEW: () => ({ kind: "settled", why: "no" }) } });
    const extra = pieces({
      decide: {
        NEW: () => ({ kind: "settled", why: "no" }),
        DONE: () => ({ kind: "settled", why: "done" }),
        LOST: () => ({ kind: "settled", why: "lost" }),
      },
    });

    const missingOutcome = await mount([missing, source], {}, HOST);
    const extraOutcome = await mount([extra, source], {}, HOST);
    expect(!missingOutcome.ok && missingOutcome.problems.join("; ")).toContain("missing `DONE`");
    expect(!extraOutcome.ok && extraOutcome.problems.join("; ")).toContain("extra `LOST`");
  });

  it("composes before, the state decision, and after as one pure plan", async () => {
    const seen: string[] = [];
    const declared = pieces({
      before: (_record: TestRecord, observation: { value: string }) => {
        seen.push(`before:${observation.value}`);
        return undefined;
      },
      decide: {
        NEW: () => { seen.push("decide:NEW"); return { kind: "settled", why: "middle" }; },
        DONE: () => ({ kind: "settled", why: "done" }),
      },
      after: (decision: Plan) => {
        seen.push(`after:${decision.why}`);
        return { ...decision, why: "filtered" } as Plan;
      },
    });
    const outcome = await mount([declared, source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect((outcome.mounted.workflow as unknown as Workflow<{ value: string }, { attempts: number }>).plan(
      declared.newRecord("C-1", HOST.now()), { value: "value" }, { attempts: 3 },
    )).toEqual({ kind: "settled", why: "filtered" });
    expect(seen).toEqual(["before:value", "decide:NEW", "after:middle"]);
  });

  it("builds discover, observe, actions and remember into the runtime with typed ports", async () => {
    const declared = pieces();
    const outcome = await mount([declared, source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("pieces") as WorkflowRuntime<TestRecord, { value: string }>;
    const record = runtime.newRecord("C-1", HOST.now());

    await expect(runtime.found()).resolves.toEqual(["value"]);
    await expect(runtime.observe(record)).resolves.toEqual({ value: "value" });
    expect(runtime.apply(record, { kind: "settled", why: "x" }, {}, { value: "value" }, HOST.now(), null).customer).toBe("C-1!");
  });

  it("lets extend mount supporting infrastructure from the same declaration", async () => {
    const queue = {
      enqueue: () => ({ workId: "x", reason: "x", availableAt: "", status: "pending" as const }),
      claim: () => null, complete: () => undefined, release: () => undefined, promote: () => 0,
      recover: () => [], prune: () => 0, ready: () => [], pending: () => [],
    };
    const declared = pieces({
      extend: (registry: Parameters<Plugin["register"]>[0]) => {
        registry.queue(queue as never);
        registry.port("support", { read: () => "support" });
        registry.action("support-action", { port: "support-action", method: "run" }, { run: async () => undefined });
        registry.contribute("harnesses", "fixture", { run: async () => undefined });
      },
    });
    const outcome = await mount([declared, source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.queue).toBe(queue);
    expect(outcome.mounted.ports.has("support")).toBe(true);
    expect(outcome.mounted.actions.get("support-action")).toEqual({ port: "support-action", method: "run" });
    expect(outcome.mounted.contributions.get("harnesses")?.has("fixture")).toBe(true);
  });

  it("refuses declarations that silently mix legacy and piece members", async () => {
    const mixed = defineWorkflow({
      name: "mixed", configSchema: schema, states: ["DONE"], terminal: ["DONE"], policy: {}, needs: {},
      record: () => ({}), plan: () => ({ kind: "settled", why: "done" }),
      runtime: () => ({ found: async () => [], observe: async () => ({}), actions: {}, apply: (record: WorkRecord) => record }),
      decide: { DONE: () => ({ kind: "settled", why: "done" }) }, observe: async () => ({}), actions: {},
    } as never);
    const outcome = await mount([mixed], {}, HOST);
    expect(!outcome.ok && outcome.problems.join("; ")).toContain("cannot mix legacy");
  });

  it("refuses a legacy declaration with piece-only progress", async () => {
    const mixed = defineWorkflow({
      name: "mixed-progress", configSchema: schema, states: ["DONE"], terminal: ["DONE"], policy: {}, needs: {},
      record: () => ({}), plan: () => ({ kind: "settled", why: "done" }),
      runtime: () => ({ found: async () => [], observe: async () => ({}), actions: {}, apply: (record: WorkRecord) => record }),
      progress: { port: "tracker", method: "update" },
    } as never);
    const outcome = await mount([mixed], {}, HOST);
    expect(!outcome.ok && outcome.problems.join("; ")).toContain("cannot mix legacy `plan`, `runtime` with `progress`");
  });
});

it("types all four planning helpers against the workflow's states and effects", () => {
  type Effect = { type: "page"; person: string };
  const { act, advance, wait, settled } = planning<"NEW" | "DONE", Effect>();

  expectTypeOf(advance).parameter(0).toEqualTypeOf<"NEW" | "DONE">();
  expect(act("page", { type: "page", person: "Sam" }).kind).toBe("act");
  expect(advance("DONE", "finished").kind).toBe("advance");
  expect(wait(1000, "waiting").kind).toBe("wait");
  expect(settled("done").kind).toBe("settled");
});

it("types an action handler by the payload named in its key", () => {
  const actions = workflowActions<{ type: "announce"; text: string }>()({
    announce: async (_scope, _work, effect) => {
      expectTypeOf(effect.text).toEqualTypeOf<string>();
    },
  });

  expect(Object.keys(actions)).toEqual(["announce"]);

  void defineWorkflow({
    name: "typed-action-declaration",
    configSchema: {}, policy: {}, needs: {}, states: ["NEW"], terminal: ["NEW"],
    record: () => ({}),
    decide: { NEW: () => settled("done") },
    observe: async () => ({}),
    actions,
  });

  void defineWorkflow({
    name: "inline-action-declaration",
    configSchema: {}, policy: {}, needs: {}, states: ["NEW"], terminal: ["NEW"],
    record: () => ({}),
    decide: { NEW: () => settled("done") },
    observe: async () => ({}),
    actions: {
      announce: async (_scope, _work, effect) => {
        expectTypeOf(effect.type).toEqualTypeOf<string>();
      },
    },
  });
});

// This is a compile-time contract: the declaration gives direct constructors
// its own state vocabulary through the decision return type.
void defineWorkflow({
  name: "typed-direct-helper",
  configSchema: {}, policy: {}, needs: {}, states: ["NEW", "DONE"], terminal: ["DONE"],
  record: () => ({}),
  decide: {
    // @ts-expect-error a decision cannot advance to a state it did not declare
    NEW: () => advance("LOST", "typo"),
    DONE: () => ({ kind: "settled", why: "done" }),
  },
  observe: async () => ({}),
  actions: {},
});

// The state-independent constructors carry only their own variant. A decision
// using one cannot be rejected for a hypothetical advance it never returns.
void defineWorkflow({
  name: "typed-direct-act",
  configSchema: {}, policy: {}, needs: {}, states: ["NEW"], terminal: ["NEW"],
  record: () => ({}), decide: { NEW: () => act("working", { type: "run" }) }, observe: async () => ({}), actions: {},
});
void defineWorkflow({
  name: "typed-direct-wait",
  configSchema: {}, policy: {}, needs: {}, states: ["NEW"], terminal: ["NEW"],
  record: () => ({}), decide: { NEW: () => wait(1_000, "waiting") }, observe: async () => ({}), actions: {},
});
void defineWorkflow({
  name: "typed-direct-settled",
  configSchema: {}, policy: {}, needs: {}, states: ["NEW"], terminal: ["NEW"],
  record: () => ({}), decide: { NEW: () => settled("done") }, observe: async () => ({}), actions: {},
});
void defineWorkflow({
  name: "typed-hook-state",
  configSchema: {}, policy: {}, needs: {}, states: ["NEW", "DONE"], terminal: ["DONE"],
  record: () => ({}),
  // @ts-expect-error a hook cannot advance to a state the workflow does not declare
  before: () => advance("LOST", "typo"),
  decide: { NEW: () => advance("DONE", "done"), DONE: () => settled("done") },
  observe: async () => ({}), actions: {},
});

describe("a decision nobody has written yet", () => {
  it("settles the record, naming its state, rather than guessing a move", () => {
    const stub = notWritten();
    const plan = stub({ id: "w-1", state: "TRIAGED", updatedAt: "", attempts: {}, history: [] });

    expect(plan).toEqual({ kind: "settled", why: "the decision for `TRIAGED` is not written yet" });
    expect(notWrittenIn(plan)).toBe("TRIAGED");
  });

  it("is told apart from a decision that settles on its own", () => {
    expect(notWrittenIn({ kind: "settled", why: "the work is done" })).toBeUndefined();
    expect(notWrittenIn({ kind: "advance", to: "DONE", effects: [], why: "the decision for `X` is not written yet" })).toBeUndefined();
  });
});
