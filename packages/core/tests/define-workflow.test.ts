import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigSchema,
  ConfigOf,
  HostServices,
  Plugin,
  Plan,
  WorkRecord,
  WorkflowRuntime,
  Workflow,
  defineWorkflow,
  mount,
  notWritten,
  notWrittenIn,
  optional,
  planning,
  port,
  validateConfig,
  WORKFLOW_RUNTIME,
  withDiagram,
  workflowActions,
  act,
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
  "policy.attempts": { type: "number", default: 3, description: "how many times one piece of work may be tried" },
  "policy.backoffMs": { type: "number", default: 1000, description: "how long a held look waits before it is taken again" },
} satisfies ConfigSchema;

const NEW_DONE = `stateDiagram-v2
    [*] --> NEW
    NEW --> DONE
    DONE --> [*]
`;

const ONLY_NEW = `stateDiagram-v2
    [*] --> NEW
    NEW --> [*]
`;

function workflow(seen: { optional?: OptionalPort; policy?: Policy } = {}) {
  return withDiagram(defineWorkflow({
    name: "example",
    configSchema: schema,
    policy: { attempts: 3, backoffMs: 1000 } satisfies Policy,
    needs: { source: port<RequiredPort>(), notifier: optional<OptionalPort>() },
    decide: { NEW: () => settled("done"), DONE: () => settled("done") },
    record: (workId) => ({ customer: workId }),
    discover: ({ ports, policy }) => {
      seen.optional = ports.notifier;
      seen.policy = policy;
      return Promise.resolve([]);
    },
    observe: async () => ({}),
    actions: {},
  }), NEW_DONE);
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
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    await (outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("example") as WorkflowRuntime).found();

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
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    await (outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("example") as WorkflowRuntime).found();

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
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("`policy.attemptz` is not a setting this plugin has");
  });

  it("refuses a typo three segments deep by the path it was written at", async () => {
    const plugin = {
      name: "deep-kept",
      configSchema: {
        "policy.limits.maxAttempts": { type: "number", default: 2, description: "how many tries an attempt gets" },
      } satisfies ConfigSchema,
      register() {},
    };
    const outcome = await mount(
      [plugin, source],
      { [plugin.name]: { policy: { limits: { maxAttemps: 9 } } } },
      HOST,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "`policy.limits.maxAttemps` is not a setting this plugin has",
    );
  });

  it("refuses an absent group whose schema requires a leaf", async () => {
    const plugin = {
      name: "owed-kept",
      configSchema: {
        "auth.token": { type: "string", required: true, description: "the credential the workflow signs with" },
      } satisfies ConfigSchema,
      register() {},
    };
    const outcome = await mount([plugin, source], { [plugin.name]: {} }, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "`auth.token` is required — the credential the workflow signs with",
    );
  });

  // A dotted schema names a nested group, and the plugin reads it nested:
  // the validator fills the group where the schema put it, and the type the
  // checker promises the plugin compiles without a cast, or it lies about
  // what the validator just filled.
  it("fills a dotted schema's group nested, typed without a cast", () => {
    const schema = {
      "policy.attempts": { type: "number", default: 2, description: "tries per item" },
    } as const;
    const outcome = validateConfig("nested-reader", schema, {});

    expect(outcome.ok).toBe(true);
    expect(outcome.ok === false ? undefined : outcome.config).toEqual({ policy: { attempts: 2 } });
    const config = (outcome.ok ? outcome.config : {}) as ConfigOf<typeof schema>;
    const attempts: number | undefined = config.policy?.attempts;
    expect(attempts).toBe(2);
  });

  // A path three segments deep is spelled the way the operator wrote it: it
  // is read, not refused for sitting next to itself, and the type reaches it.
  it("accepts a declared path three segments deep and types it", () => {
    const schema = {
      "policy.limits.maxAttempts": { type: "number", default: 2, description: "tries per item" },
    } as const;
    const outcome = validateConfig("deep-user", schema, { policy: { limits: { maxAttempts: 9 } } });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok === false ? undefined : outcome.config).toEqual({ policy: { limits: { maxAttempts: 9 } } });
    const config = (outcome.ok ? outcome.config : {}) as ConfigOf<typeof schema>;
    const attempts: number | undefined = config.policy?.limits?.maxAttempts;
    expect(attempts).toBe(9);
  });

  // A group nothing fills is still handed over, because the type the checker
  // promised is read unguarded: `{}` there, not a missing group.
  it("hands an absent optional-only group as an empty mapping", () => {
    const schema = {
      "auth.token": { type: "string", description: "the credential the workflow signs with" },
    } as const;
    const outcome = validateConfig("present-group", schema, {});

    expect(outcome.ok).toBe(true);
    expect(outcome.ok === false ? undefined : outcome.config).toEqual({ auth: {} });
    const config = (outcome.ok ? outcome.config : {}) as ConfigOf<typeof schema>;
    const token: string | undefined = config.auth?.token;
    expect(token).toBe(undefined);
  });

  it("refuses a decision default its schema does not declare, naming the key", async () => {
    const plugin = withDiagram(defineWorkflow({
      name: "unproven",
      configSchema: {
        repos: { type: "string[]", required: true, description: "the repositories this workflow works in" },
      } satisfies ConfigSchema,
      policy: { ceiling: 5 },
      needs: { source: port<RequiredPort>() },
      decide: { NEW: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), ONLY_NEW);
    const outcome = await mount([plugin, source], { [plugin.name]: { repos: ["acme/widgets"] } }, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "the unproven workflow reads `policy.ceiling`, and its schema declares no such setting",
    );
  });

  it("refuses a schema default that differs from the one the decision reads", async () => {
    const plugin = withDiagram(defineWorkflow({
      name: "twoanswers",
      configSchema: {
        "policy.attempts": { type: "number", default: 5, description: "how many times one piece of work may be tried" },
      } satisfies ConfigSchema,
      policy: { attempts: 3 },
      needs: { source: port<RequiredPort>() },
      decide: { NEW: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), ONLY_NEW);
    const outcome = await mount([plugin, source], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "`policy.attempts` defaults to 5, and its decision reads 3",
    );
  });

  it("constructs records with the six core fields and only the declared domain fields", async () => {
    const outcome = await mount([workflow(), source], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("example") as WorkflowRuntime<TestRecord>;

    expect(runtime.newRecord("C-1", HOST.now())).toEqual({
      id: "C-1",
      state: "NEW",
      updatedAt: "2026-10-29T12:00:00.000Z",
      attempts: {},
      looks: {},
      history: [],
      customer: "C-1",
    });
  });

  // A claim that reads a required setting has no configuration to read until
  // the host supplies one. Reading it at import would throw for a workflow
  // whose config is valid; the mount rebuilds the declaration with its own
  // config, and that is the workflow it registers.
  it("evaluates a configuration-dependent claim only where a configuration exists", async () => {
    const declared = withDiagram(defineWorkflow({
      name: "claimed",
      configSchema: {
        repos: { type: "string[]", required: true, description: "the repositories this workflow works in" },
        "policy.attempts": { type: "number", default: 3, description: "how many times one piece of work may be tried" },
      } satisfies ConfigSchema,
      policy: { attempts: 3 },
      needs: { source: port<RequiredPort>() },
      trackerWrites: ({ config }) => (config.repos.includes("acme/widgets") ? ["comment"] : []),
      decide: { NEW: () => settled("done") },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), ONLY_NEW);

    expect(declared.workflow.trackerWrites).toEqual([]);

    const outcome = await mount([declared, source], { [declared.name]: { repos: ["acme/widgets"] } }, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow?.trackerWrites).toEqual(["comment"]);
  });

  // Only the pieces mount: a declaration still written as one `plan` and a
  // `runtime` factory is refused by name, saying where each moved, rather
  // than read as a workflow whose decisions are all missing.
  it("refuses a declaration that still passes plan and runtime, naming where each moved", async () => {
    const legacy = withDiagram(defineWorkflow({
      name: "legacy", configSchema: schema, policy: { attempts: 3, backoffMs: 1000 }, needs: {},
      record: () => ({}), plan: () => ({ kind: "settled", why: "done" }),
      runtime: () => ({ found: async () => [], observe: async () => ({}), actions: {}, apply: (record: WorkRecord) => record }),
    } as never), ONLY_NEW);
    const outcome = await mount([legacy], {}, HOST);

    expect(!outcome.ok && outcome.problems.join("; ")).toContain(
      "the legacy workflow declares `plan` and `runtime`, which no longer mount: `plan` moves onto `decide`, one key per drawn state; `runtime` moves onto `discover`, `observe`, `actions` and `remember`",
    );
  });

  // A workflow installed from outside is a declaration, so what a plugin
  // prepares and the environment it reads have to travel on it too.
  it("carries the setup and the environment a plugin declares", () => {
    const setup = [{ name: "pager", run: () => ({ label: "pager", ok: true }) }];
    const declared = defineWorkflow({
      name: "prepared", configSchema: {}, policy: {}, needs: {}, record: () => ({}),
      setup, environment: ["PAGER_TOKEN"],
      decide: { NEW: () => settled("done") }, observe: async () => ({}), actions: {},
    });

    expect(declared.setup).toBe(setup);
    expect(declared.environment).toEqual(["PAGER_TOKEN"]);
  });

  it("refuses a declaration that mixes a leftover plan with the pieces", async () => {
    const mixed = withDiagram(defineWorkflow({
      name: "mixed", configSchema: schema, policy: { attempts: 3, backoffMs: 1000 }, needs: {},
      record: () => ({}), plan: () => ({ kind: "settled", why: "done" }),
      decide: { NEW: () => settled("done") }, observe: async () => ({}), actions: {},
    } as never), ONLY_NEW);
    const outcome = await mount([mixed], {}, HOST);

    expect(!outcome.ok && outcome.problems.join("; ")).toContain("the mixed workflow declares `plan`, which no longer mount");
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

it("marks an act that only prepares the try, with or without the typed helpers", () => {
  const { act: typedAct } = planning<"NEW", { type: "prepare-branch" }>();

  expect(act("prepare", { attempt: false }, { type: "prepare-branch" })).toEqual({
    kind: "act", why: "prepare", effects: [{ type: "prepare-branch" }], attempt: false,
  });
  expect(typedAct("prepare", { attempt: false }, { type: "prepare-branch" })).toEqual({
    kind: "act", why: "prepare", effects: [{ type: "prepare-branch" }], attempt: false,
  });
  expect(act("try", { type: "prepare-branch" })).not.toHaveProperty("attempt");
  expect(act("nothing to carry").effects).toEqual([]);
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
    configSchema: {}, policy: {}, needs: {},
    record: () => ({}),
    decide: { NEW: () => settled("done") },
    observe: async () => ({}),
    actions,
  });

  void defineWorkflow({
    name: "inline-action-declaration",
    configSchema: {}, policy: {}, needs: {},
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

// The state-independent constructors carry only their own variant. A decision
// using one cannot be rejected for a hypothetical advance it never returns.
void defineWorkflow({
  name: "typed-direct-act",
  configSchema: {}, policy: {}, needs: {},
  record: () => ({}), decide: { NEW: () => act("working", { type: "run" }) }, observe: async () => ({}), actions: {},
});
void defineWorkflow({
  name: "typed-direct-wait",
  configSchema: {}, policy: {}, needs: {},
  record: () => ({}), decide: { NEW: () => wait(1_000, "waiting") }, observe: async () => ({}), actions: {},
});
void defineWorkflow({
  name: "typed-direct-settled",
  configSchema: {}, policy: {}, needs: {},
  record: () => ({}), decide: { NEW: () => settled("done") }, observe: async () => ({}), actions: {},
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
