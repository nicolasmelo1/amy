import { describe, it, expect } from "vitest";
import { Plugin, PluginContext, Workflow } from "../src/plugin.js";
import { HostServices, mount, mountedActions, unmetNeeds } from "../src/mount.js";
import { ActionContext, WORKFLOW_RUNTIME, WorkflowRuntime } from "../src/runtime.js";
import { acceptsAction, implementationOf, runAction, undeclaredIn } from "../src/dispatch.js";

/** The services a host lends every plugin, with nothing that touches a machine. */
const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", checkouts: {}, state: "/w/.amy" },
};

function plugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  return { name, version: "0.1.0", register: () => {}, ...overrides };
}

const WORKFLOW: Workflow<never, never> = {
  name: "toy",
  states: ["START", "DONE"],
  waitingStates: [],
  initialState: "START",
  terminalStates: ["DONE"],
  usesObservers: ["ticket"],
  plan: () => ({ kind: "settled", why: "toy" }),
};

describe("mount", () => {
  it("mounts nothing from nothing", async () => {
    const outcome = await mount([], {}, HOST);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok === true && outcome.mounted.plugins).toEqual([]);
  });

  it("ships the core actions before any plugin says a word", async () => {
    const outcome = await mount([], {}, HOST);

    expect(outcome.ok === true && outcome.mounted.actions.has("implement")).toBe(true);
  });

  it("records what mounted, with versions", async () => {
    const outcome = await mount([plugin("@amykit/plugin-a"), plugin("@amykit/plugin-b")], {}, HOST);

    expect(outcome.ok === true && outcome.mounted.plugins).toEqual([
      { name: "@amykit/plugin-a", version: "0.1.0" },
      { name: "@amykit/plugin-b", version: "0.1.0" },
    ]);
  });

  it("hands a plugin its own validated settings and nobody else's", async () => {
    let seen: unknown;
    const p = plugin("@amykit/plugin-a", {
      configSchema: { target: { type: "string", description: "where", default: "here" } },
      register: (_r, ctx) => {
        seen = ctx.config;
      },
    });

    await mount([p], { "@amykit/plugin-a": {}, "@amykit/plugin-b": { other: 1 } }, HOST);

    expect(seen).toEqual({ target: "here" });
  });

  it("refuses a bad setting at boot, naming the plugin and the field", async () => {
    const p = plugin("@amykit/plugin-a", {
      configSchema: { target: { type: "string", description: "where", required: true } },
    });

    const outcome = await mount([p], { "@amykit/plugin-a": {} }, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems[0]).toContain("@amykit/plugin-a: `target` is required");
  });

  it("does not register a plugin whose settings were refused", async () => {
    let registered = false;
    const p = plugin("@amykit/plugin-a", {
      configSchema: { target: { type: "string", description: "where", required: true } },
      register: () => {
        registered = true;
      },
    });

    await mount([p], { "@amykit/plugin-a": {} }, HOST);

    expect(registered).toBe(false);
  });

  it("refuses settings given to a plugin that has none", async () => {
    const outcome = await mount([plugin("@amykit/plugin-a")], { "@amykit/plugin-a": { target: "x" } }, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("has no settings");
  });

  it("refuses two plugins claiming the same port", async () => {
    const a = plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) });
    const b = plugin("@amykit/plugin-b", { register: (r) => r.port("tracker", {}) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "the `tracker` port is already mounted",
    );
  });

  it("refuses two workflows, because the order of actions cannot be two things", async () => {
    const a = plugin("@amykit/w-a", { register: (r) => r.workflow(WORKFLOW) });
    const b = plugin("@amykit/w-b", { register: (r) => r.workflow(WORKFLOW) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("a workflow is already mounted");
  });

  it("refuses two plugins contributing the same observation", async () => {
    const source = { observe: async () => ({}) };
    const a = plugin("@amykit/plugin-a", { register: (r) => r.observer("ticket", source) });
    const b = plugin("@amykit/plugin-b", { register: (r) => r.observer("ticket", source) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "the `ticket` observation is already contributed",
    );
  });

  it("lets a plugin add an action the core does not have, with its port", async () => {
    const p = plugin("@amykit/plugin-browser", {
      register: (r) => r.action("check-web-browser", { port: "browser", method: "check" }, {}),
    });

    const outcome = await mount([p], {}, HOST);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok === true && outcome.mounted.actions.get("check-web-browser")).toEqual({
      port: "browser",
      method: "check",
    });
    expect(outcome.ok === true && outcome.mounted.ports.has("browser")).toBe(true);
  });

});

describe("contributions", () => {
  it("collects what several plugins add to one collection", async () => {
    const a = plugin("@amykit/plugin-a", { register: (r) => r.contribute("notify-channel", "hermes", {}) });
    const b = plugin("@amykit/plugin-b", { register: (r) => r.contribute("notify-channel", "inbox", {}) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === true && [...outcome.mounted.contributions.get("notify-channel")!.keys()]).toEqual([
      "hermes",
      "inbox",
    ]);
  });

  it("refuses the same name twice in one collection", async () => {
    const a = plugin("@amykit/plugin-a", { register: (r) => r.contribute("notify-channel", "hermes", {}) });
    const b = plugin("@amykit/plugin-b", { register: (r) => r.contribute("notify-channel", "hermes", {}) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "`hermes` is already in the `notify-channel` collection",
    );
  });

  it("lets a consumer see a contribution made after it was mounted", async () => {
    // This is why the context reads live. A plugin that composes others is
    // otherwise at the mercy of the order somebody listed them in: the
    // fan-out is mounted before the channels it fans out to.
    let captured: PluginContext | null = null;
    const consumer = plugin("@amykit/plugin-fanout", {
      register: (_r, ctx) => {
        captured = ctx;
      },
    });
    const later = plugin("@amykit/plugin-hermes", {
      register: (r) => r.contribute("notify-channel", "hermes", {}),
    });

    await mount([consumer, later], {}, HOST);

    expect([...captured!.contributions("notify-channel").keys()]).toEqual(["hermes"]);
  });

  it("hands a plugin the services the host lends, not its own", async () => {
    let seen: { workspace: string; hasRunner: boolean } | null = null;
    const p = plugin("@amykit/plugin-a", {
      register: (_r, ctx) => {
        seen = { workspace: ctx.paths.workspace, hasRunner: typeof ctx.runner.run === "function" };
      },
    });

    await mount([p], {}, HOST);

    expect(seen).toEqual({ workspace: "/w", hasRunner: true });
  });

  it("lets a plugin reach a port another plugin mounted", async () => {
    let found: object | undefined;
    const provider = plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", { id: 1 }) });
    const consumer = plugin("@amykit/plugin-b", {
      register: (_r, ctx) => {
        found = ctx.port("tracker");
      },
    });

    await mount([provider, consumer], {}, HOST);

    expect(found).toEqual({ id: 1 });
  });
  it("hands a workflow only the tracker writes it claimed", async () => {
    let context: PluginContext | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { comments += 1; } }),
    });

    await mount([workflow, tracker], {}, HOST);

    await expect((context!.port("tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
    expect(comments).toBe(0);
  });

  it("hands a workflow only the code-host writes it claimed", async () => {
    let context: PluginContext | undefined;
    let opened = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, codeHostWrites: [] });
        context = ctx;
      },
    });
    const host = plugin("@amykit/plugin-code-host", {
      register: (r) => r.port("code-host", { openPullRequest: async () => { opened += 1; } }),
    });

    await mount([workflow, host], {}, HOST);

    await expect((context!.port("code-host") as { openPullRequest(): Promise<void> }).openPullRequest()).rejects.toThrow("open-pull-request");
    expect(opened).toBe(0);
  });

  it("does not expose adapter internals through a workflow's narrowed port", async () => {
    let context: PluginContext | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, codeHostWrites: [] });
        context = ctx;
      },
    });
    const host = plugin("@amykit/plugin-code-host", {
      register: (r) => r.port("code-host", { findPullRequest: async () => null, gh: async () => { throw new Error("called"); } }),
    });

    await mount([workflow, host], {}, HOST);

    const port = context!.port("code-host") as { findPullRequest(): Promise<null>; gh?: () => Promise<void> };
    await expect(port.findPullRequest()).resolves.toBeNull();
    expect(port.gh).toBeUndefined();
    expect(Object.getPrototypeOf(port)).toBeNull();
  });

  it("gives the serial engine the workflow's narrowed port rather than its own full context", async () => {
    let engineContext: PluginContext | undefined;
    const engine = plugin("@amykit/plugin-engine", { register: (_r, ctx) => { engineContext = ctx; } });
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, trackerWrites: [] }) });
    const tracker = plugin("@amykit/plugin-tracker", { register: (r) => r.port("tracker", { comment: async () => {} }) });

    await mount([engine, workflow, tracker], {}, HOST);

    await expect((engineContext!.workflowPort!("tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });
});

/** A handler that does nothing, for a declaration whose behaviour is not the point. */
const HANDLED = async (): Promise<void> => {};

/** The toy workflow's runtime, declaring exactly the actions it is given. */
function runtimeWith(actions: Record<string, unknown>): WorkflowRuntime {
  return {
    policy: {},
    found: async () => [],
    newRecord: (id, now) => ({ id, state: "START", updatedAt: now.toISOString(), attempts: {}, history: [] }),
    observe: async () => ({}),
    actions: actions as WorkflowRuntime["actions"],
    apply: (record) => record,
  };
}

/** The plugin that contributes it, the way a workflow package does. */
function toyRuntime(actions: Record<string, unknown>): Plugin {
  return plugin("@amykit/workflow-toy", {
    register: (r) => r.contribute(WORKFLOW_RUNTIME, "toy", runtimeWith(actions)),
  });
}

describe("unmetNeeds", () => {
  async function mountedWith(plugins: Plugin[], actions: Record<string, unknown> = { triage: HANDLED }) {
    const outcome = await mount([...plugins, toyRuntime(actions)], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    return outcome.mounted;
  }

  it("names an action whose port nothing mounted", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.observer("ticket", { observe: async () => ({}) }) }),
    ]);

    // `triage` is a core action, so it is defined, but nothing is the agent.
    expect(unmetNeeds(mounted, WORKFLOW)).toEqual([
      "action `triage`: needs the `agent` port, which nothing mounted",
    ]);
  });

  it("names an action nothing defines at all", async () => {
    const mounted = await mountedWith([], { "check-web-browser": HANDLED });
    const workflow = { ...WORKFLOW, usesObservers: [] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `check-web-browser`: nothing defines it",
    ]);
  });

  it("names an observation nothing contributes", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("agent", {}) }),
    ]);

    expect(unmetNeeds(mounted, WORKFLOW)).toEqual(["observation `ticket`: nothing contributes it"]);
  });

  it("refuses a workflow that mutates the tracker while claiming no capability", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "ask-question": HANDLED });
    // `ask-question` is a core tracker action, so it is defined and its port
    // is mounted; the refusal is the undeclared write alone.
    const workflow = { ...WORKFLOW, usesObservers: [] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `ask-question` writes the tracker (`comment`), " +
        "but the workflow does not claim that capability — add `comment` to its `trackerWrites`",
    ]);
  });

  it("refuses a workflow that mutates the code host while claiming no capability", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("code-host", {}) }),
    ], { "open-pull-request": HANDLED });
    const workflow = { ...WORKFLOW, usesObservers: [] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `open-pull-request` writes the code-host (`open-pull-request`), " +
        "but the workflow does not claim that capability — add `open-pull-request` to its `codeHostWrites`",
    ]);
  });

  it("refuses a claimed capability no mounted code host could honour", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("agent", {}) }),
    ], { triage: HANDLED });
    const workflow = { ...WORKFLOW, usesObservers: [], codeHostWrites: ["delete-everything"] };

    expect(unmetNeeds(mounted, workflow)[0]).toContain("the workflow claims the code-host write `delete-everything`");
  });

  it("accepts the claim a workflow makes for the writes it uses", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "ask-question": HANDLED });
    const workflow = {
      ...WORKFLOW,
      usesObservers: [],
      trackerWrites: ["comment"],
    };

    expect(unmetNeeds(mounted, workflow)).toEqual([]);
  });

  it("refuses a claimed capability no mounted tracker could honour", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "ask-question": HANDLED });
    const workflow = {
      ...WORKFLOW,
      usesObservers: [],
      trackerWrites: ["delete-everything"],
    };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "the workflow claims the tracker write `delete-everything`, which is not one a mounted tracker could honour — " +
        "`comment`, `set-status`, `assign` or `create-follow-up`",
      "action `ask-question` writes the tracker (`comment`), " +
        "but the workflow does not claim that capability — add `comment` to its `trackerWrites`",
    ]);
  });

  it("finds nothing missing when everything the workflow named is there", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", {
        register: (r) => {
          r.port("agent", {});
          r.observer("ticket", { observe: async () => ({}) });
        },
      }),
    ]);

    expect(unmetNeeds(mounted, WORKFLOW)).toEqual([]);
  });
});

describe("one declaration per action", () => {
  async function mounted(plugins: Plugin[], actions: Record<string, unknown>) {
    const outcome = await mount([...plugins, toyRuntime(actions)], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    return outcome.mounted;
  }
  const workflow = { ...WORKFLOW, usesObservers: [] };
  const forge = (): Plugin =>
    plugin("@amykit/plugin-forge", { register: (r) => r.port("forge", { merge: acceptsAction(async () => 7) }) });

  it("refuses at boot an action declared with nothing behind it, naming it", async () => {
    const host = await mounted([plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) })], {
      "hand-off-to-qa": undefined,
    });

    expect(unmetNeeds(host, { ...workflow, trackerWrites: ["set-status"] })).toEqual([
      "action `hand-off-to-qa` is declared with no implementation — give it a handler, or a port and a method",
    ]);
  });

  it("refuses an implementation that is neither a handler nor a port and a method", async () => {
    const host = await mounted([], { merge: { port: "forge" } });

    expect(unmetNeeds(host, workflow)).toEqual([
      "action `merge` is declared with no implementation — give it a handler, or a port and a method",
    ]);
  });

  it("wires a port and a method without the workflow writing a handler", async () => {
    const host = await mounted([forge()], { merge: { port: "forge", method: "merge" } });
    expect(unmetNeeds(host, workflow)).toEqual([]);

    const runtime = host.contributions.get(WORKFLOW_RUNTIME)!.get("toy") as WorkflowRuntime;
    const context: ActionContext = { record: runtime.newRecord("t", HOST.now()), observation: {}, outcomes: {} };
    await runAction(implementationOf(runtime, "merge"), { type: "merge" }, context, (kind) => host.ports.get(kind));

    // What the port returned lands under the action's name, for `apply`.
    expect(context.outcomes).toEqual({ merge: 7 });
  });

  it("reaches every declared action through the same dispatch the engine uses", async () => {
    const calls: string[] = [];
    const host = await mounted(
      [
        plugin("@amykit/plugin-forge", {
          register: (r) => r.port("forge", { merge: acceptsAction(async () => calls.push("merge")) }),
        }),
        plugin("@amykit/plugin-agent", { register: (r) => r.port("agent", {}) }),
      ],
      { triage: async () => void calls.push("triage"), merge: { port: "forge", method: "merge" } },
    );
    expect(unmetNeeds(host, workflow)).toEqual([]);

    const runtime = host.contributions.get(WORKFLOW_RUNTIME)!.get("toy") as WorkflowRuntime;
    for (const name of mountedActions(host, workflow)) {
      const context: ActionContext = { record: runtime.newRecord("t", HOST.now()), observation: {}, outcomes: {} };
      await runAction(implementationOf(runtime, name), { type: name }, context, (kind) => host.ports.get(kind));
    }

    expect(calls.sort()).toEqual(["merge", "triage"]);
  });

  it("names a port-and-method whose port nothing mounted", async () => {
    const host = await mounted([], { merge: { port: "forge", method: "merge" } });

    expect(unmetNeeds(host, workflow)).toEqual([
      "action `merge`: needs the `forge` port, which nothing mounted",
    ]);
  });

  it("names a port-and-method whose port has no such method", async () => {
    const host = await mounted([forge()], { merge: { port: "forge", method: "squash" } });

    expect(unmetNeeds(host, workflow)).toEqual(["action `merge`: the `forge` port has no method `squash`"]);
  });

  it("refuses a port-and-method whose method takes its own arguments, not an action", async () => {
    // The shape `plan-check` mounts: `check(repo, workId)`. Called with an
    // action and a context it would run against the wrong repository rather
    // than fail, so it is refused before anything calls it.
    const host = await mounted(
      [plugin("@amykit/plugin-plan-check", { register: (r) => r.port("plan-check", { check: async (_repo: string) => ({}) }) })],
      { "check-plan": { port: "plan-check", method: "check" } },
    );

    expect(unmetNeeds(host, workflow)).toEqual([
      "action `check-plan`: `plan-check.check` takes its own arguments, not an action — write a handler that calls it, or mark it with `acceptsAction`",
    ]);
  });

  it("records a port-and-method that returned nothing, under its name", async () => {
    const host = await mounted(
      [plugin("@amykit/plugin-forge", { register: (r) => r.port("forge", { merge: acceptsAction(async () => undefined) }) })],
      { merge: { port: "forge", method: "merge" } },
    );
    const runtime = host.contributions.get(WORKFLOW_RUNTIME)!.get("toy") as WorkflowRuntime;
    const context: ActionContext = { record: runtime.newRecord("t", HOST.now()), observation: {}, outcomes: {} };

    await runAction(implementationOf(runtime, "merge"), { type: "merge" }, context, (kind) => host.ports.get(kind));

    expect(Object.hasOwn(context.outcomes, "merge")).toBe(true);
  });

  it("refuses a port-and-method that sends a catalogued action somewhere else", async () => {
    const host = await mounted(
      [plugin("@amykit/plugin-forge", { register: (r) => r.port("forge", { triage: acceptsAction(async () => {}) }) })],
      { triage: { port: "forge", method: "triage" } },
    );

    expect(unmetNeeds(host, workflow)).toEqual([
      "action `triage` is wired to the `forge` port, but the catalogue runs it on `agent`",
    ]);
  });

  it("finds a plan's actions the runtime never declared", () => {
    const runtime = runtimeWith({ triage: HANDLED });
    const plan = { kind: "act" as const, why: "x", effects: [{ type: "triage" }, { type: "hand-off-to-qa" }] };

    expect(undeclaredIn(runtime, plan)).toEqual(["hand-off-to-qa"]);
    // Own keys only: a name every object inherits is not a declaration.
    expect(undeclaredIn(runtime, { ...plan, effects: [{ type: "toString" }] })).toEqual(["toString"]);
  });

  it("names a workflow that contributed no runtime", async () => {
    const outcome = await mount([], {}, HOST);
    if (!outcome.ok) throw new Error("mount failed");

    expect(unmetNeeds(outcome.mounted, workflow)).toEqual([
      "the workflow `toy` contributed no runtime to `workflow-runtime`, so nothing can run its actions",
    ]);
  });

  it("tells an author still on the old contract what to change", async () => {
    const legacy = await mount(
      [
        plugin("@amykit/workflow-toy", {
          register: (r) => {
            const { actions: _actions, ...rest } = runtimeWith({});
            r.contribute(WORKFLOW_RUNTIME, "toy", { ...rest, handlers: () => ({}) });
          },
        }),
      ],
      {},
      HOST,
    );
    if (!legacy.ok) throw new Error("mount failed");

    expect(unmetNeeds(legacy.mounted, { ...workflow, usesActions: [] } as Workflow<never, never>)).toEqual([
      "the workflow `toy` still declares `usesActions`, which is now the keys of its runtime's `actions` — delete it and key each action there, beside what runs it",
      "the workflow `toy` still has `handlers()`, which is now `actions`: one map whose keys are the actions it emits and whose values run them",
    ]);
  });
});

describe("a plugin that cannot mount", () => {
  it("becomes a problem with a name, not an anonymous throw", async () => {
    const broken = plugin("@amykit/plugin-broken", {
      register: () => {
        throw new Error("LINEAR_API_KEY is not set");
      },
    });

    const outcome = await mount([broken], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toBe(
      "@amykit/plugin-broken: failed to mount — LINEAR_API_KEY is not set",
    );
  });

  it("does not count as mounted", async () => {
    const broken = plugin("@amykit/plugin-broken", {
      register: () => {
        throw new Error("nope");
      },
    });
    const fine = plugin("@amykit/plugin-fine");

    const outcome = await mount([broken, fine], {}, HOST);

    expect(outcome.ok).toBe(false);
    // The one that worked still registered, so one bad plugin does not hide
    // the state of the others.
    expect(outcome.ok === false && outcome.problems).toHaveLength(1);
  });
});
