import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigSchema,
  HostServices,
  Plugin,
  WorkRecord,
  WorkflowRuntime,
  WorkflowRuntimeParts,
  defineWorkflow,
  mount,
  notWritten,
  notWrittenIn,
  optional,
  planning,
  port,
  WORKFLOW_RUNTIME,
} from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-29T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

interface Record extends WorkRecord {
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
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("example") as WorkflowRuntime<Record>;

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
    class ClassRuntime implements WorkflowRuntimeParts<Record, unknown> {
      readonly actions = {};
      #looks: string[] = [];

      async found(): Promise<readonly string[]> {
        this.#looks.push("found");
        return ["C-1"];
      }

      async observe(): Promise<unknown> {
        return {};
      }

      apply(record: Record): Record {
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
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("classy") as WorkflowRuntime<Record>;

    await expect(runtime.found()).resolves.toEqual(["C-1"]);
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
