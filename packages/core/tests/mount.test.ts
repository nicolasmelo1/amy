import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect } from "vitest";
import { DIAGRAM_FILE } from "../src/diagram.js";
import { defineWorkflow, diagramBeside, withDiagramBeside } from "../src/define-workflow.js";
import { Plugin, PluginContext, Workflow } from "../src/plugin.js";
import { HostServices, mount, mountedActions, unmetNeeds } from "../src/mount.js";
import { ActionContext, WORKFLOW_RUNTIME, WorkflowRuntime } from "../src/runtime.js";
import { acceptsAction, implementationOf, runAction, undeclaredIn } from "../src/dispatch.js";
import { deferred } from "../src/deferred.js";

/** The services a host lends every plugin, with nothing that touches a machine. */
const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", checkouts: {}, state: "/w/.amy" },
};

function plugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  return { name, register: () => {}, ...overrides };
}

const WORKFLOW: Workflow<never, never> = {
  name: "toy",
  states: ["START", "DONE"],
  waitingStates: [],
  initialState: "START",
  terminalStates: ["DONE"],
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

  it("records the names of what mounted", async () => {
    const outcome = await mount([plugin("@amykit/plugin-a"), plugin("@amykit/plugin-b")], {}, HOST);

    expect(outcome.ok === true && outcome.mounted.plugins).toEqual([
      "@amykit/plugin-a",
      "@amykit/plugin-b",
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
    let cached: object | undefined;
    let cachedComment: (() => Promise<void>) | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        cached = ctx.port("tracker");
        cachedComment = (cached as { comment(): Promise<void> }).comment;
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { comments += 1; } }),
    });

    await mount([tracker, workflow], {}, HOST);

    await expect((context!.port("tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
    await expect((cached as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
    await expect(cachedComment!()).rejects.toThrow("comment");
    expect(comments).toBe(0);
  });

  it("lets a cached writer use the capability its workflow declares", async () => {
    let cachedComment: (() => Promise<void>) | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        cachedComment = (ctx.port("tracker") as { comment(): Promise<void> }).comment;
        r.workflow({ ...WORKFLOW, trackerWrites: ["comment"] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { comments += 1; } }),
    });

    await mount([tracker, workflow], {}, HOST);

    await expect(cachedComment!()).resolves.toBeUndefined();
    expect(comments).toBe(1);
  });

  it("does not let a workflow retain an adapter-owned object before declaring itself", async () => {
    let retained: { mutate(): Promise<void> } | undefined;
    let described: { mutate?: () => Promise<void> } | undefined;
    let cachedMutate: (() => Promise<void>) | undefined;
    let mutations = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        const port = ctx.port("tracker") as { client: { mutate(): Promise<void> } };
        retained = port.client;
        described = Object.getOwnPropertyDescriptor(port, "client")?.value as typeof described;
        cachedMutate = port.client.mutate;
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { client: { mutate: async () => { mutations += 1; } } }),
    });

    await mount([tracker, workflow], {}, HOST);

    expect(retained).toBeDefined();
    expect((retained as { mutate?: () => Promise<void> }).mutate).toBeUndefined();
    expect(described?.mutate).toBeUndefined();
    expect(await cachedMutate!()).toBeUndefined();
    expect(mutations).toBe(0);
  });

  it("does not let a workflow retain an adapter object through an accessor descriptor", async () => {
    let retainedGetter: (() => { mutate(): Promise<void> }) | undefined;
    let mutations = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        const port = ctx.port("tracker")!;
        retainedGetter = Object.getOwnPropertyDescriptor(port, "client")?.get as typeof retainedGetter;
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => {
        const adapter = {} as { readonly client: { mutate(): Promise<void> } };
        Object.defineProperty(adapter, "client", {
          configurable: false,
          get: () => ({ mutate: async () => { mutations += 1; } }),
        });
        r.port("tracker", adapter);
      },
    });

    await mount([tracker, workflow], {}, HOST);

    expect(retainedGetter).toBeDefined();
    expect((retainedGetter!() as { mutate?: () => Promise<void> }).mutate).toBeUndefined();
    expect(mutations).toBe(0);
  });

  it("does not expose a mutable prototype or invoke a writer while a workflow registers", async () => {
    let retainedPrototype: object | null | undefined;
    let earlyWrite: Promise<unknown> | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        const port = ctx.port("tracker") as { comment(): Promise<void> };
        retainedPrototype = Object.getPrototypeOf(port);
        earlyWrite = port.comment();
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => {
        class Adapter {
          async helper(): Promise<void> { comments += 1; }
          async comment(): Promise<void> { comments += 1; }
        }
        r.port("tracker", new Adapter());
      },
    });

    await mount([tracker, workflow], {}, HOST);

    expect(retainedPrototype).toBeNull();
    await expect(earlyWrite).rejects.toThrow("comment");
    expect(comments).toBe(0);
  });

  it("keeps a cached writer inert while an async workflow registers", async () => {
    let deferredWrite: Promise<void> | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: async (r, ctx) => {
        const comment = (ctx.port("tracker") as { comment(): Promise<void> }).comment;
        await Promise.resolve();
        deferredWrite = comment();
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { comments += 1; } }),
    });

    await mount([tracker, workflow], {}, HOST);

    await expect(deferredWrite).rejects.toThrow("comment");
    expect(comments).toBe(0);
  });

  it("rejects an awaited pre-registration writer without deadlocking boot", async () => {
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: async (r, ctx) => {
        const comment = (ctx.port("tracker") as { comment(): Promise<void> }).comment;
        await expect(comment()).rejects.toThrow("before registration");
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { comments += 1; } }),
    });

    await expect(mount([tracker, workflow], {}, HOST)).resolves.toMatchObject({ ok: true });
    expect(comments).toBe(0);
  });

  it("allows an async workflow to await a contract reader before registering", async () => {
    const workflow = plugin("@amykit/workflow-toy", {
      register: async (r, ctx) => {
        const tracker = ctx.port("tracker") as { get(id: string): Promise<{ id: string }> };
        await expect(tracker.get("amy-96")).resolves.toEqual({ id: "amy-96" });
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { get: async (id: string) => ({ id }) }),
    });

    await expect(mount([tracker, workflow], {}, HOST)).resolves.toMatchObject({ ok: true });
  });

  it("snapshots write declarations when the workflow mounts", async () => {
    let context: PluginContext | undefined;
    const declaration = { ...WORKFLOW, trackerWrites: [] as string[] };
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow(declaration); context = ctx; },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { throw new Error("called"); } }),
    });

    await mount([workflow, tracker], {}, HOST);
    declaration.trackerWrites.push("comment");

    await expect((context!.port("tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });

  it("classifies an implicitly mounted code-host alias from its reader contract", async () => {
    let context: PluginContext | undefined;
    let merges = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, codeHostWrites: [] });
        context = ctx;
      },
    });
    const action = plugin("@amykit/plugin-forge-action", {
      register: (r) => r.action("find", { port: "forge", method: "findPullRequest" }, {
        findPullRequest: async () => null,
        merge: async () => { merges += 1; },
      }),
    });

    await mount([action, workflow], {}, HOST);

    await expect((context!.workflowPort!("forge") as { merge(): Promise<void> }).merge()).rejects.toThrow("merge");
    expect(merges).toBe(0);
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

  it("hands a workflow that claims no writes every code-host reader, ancestry included", async () => {
    let context: PluginContext | undefined;
    let writes = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [], codeHostWrites: [] });
        context = ctx;
      },
    });
    const host = plugin("@amykit/plugin-code-host", {
      register: (r) => r.port("code-host", {
        pullRequestAncestry: async () => ({ state: "merged", headBranch: "ada/parent", baseBranch: "main" }),
        findPullRequestMentioning: async () => null,
        authoredWithChangesRequested: async () => [],
        openPullRequest: async () => { writes += 1; },
        merge: async () => { writes += 1; },
      }),
    });

    await mount([workflow, host], {}, HOST);

    const port = context!.port("code-host") as Record<string, (...args: unknown[]) => Promise<unknown>>;
    await expect(port["pullRequestAncestry"]!("acme/widgets", 90)).resolves.toEqual({ state: "merged", headBranch: "ada/parent", baseBranch: "main" });
    await expect(port["findPullRequestMentioning"]!("acme/widgets", "BILL-1")).resolves.toBeNull();
    await expect(port["authoredWithChangesRequested"]!("ada", ["acme/widgets"])).resolves.toEqual([]);
    await expect(port["openPullRequest"]!()).rejects.toThrow("open-pull-request");
    await expect(port["merge"]!()).rejects.toThrow("merge");
    expect(writes).toBe(0);
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

  it("copies only the public action marker onto workflow-visible methods", async () => {
    let context: PluginContext | undefined;
    const privateMarker = Symbol("private");
    const method = Object.assign(async () => undefined, {
      [Symbol.for("amykit.acceptsAction")]: true,
      [privateMarker]: { mutate: async () => { throw new Error("called"); } },
    });
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow({ ...WORKFLOW, trackerWrites: ["comment"] }); context = ctx; },
    });
    const tracker = plugin("@amykit/plugin-tracker", { register: (r) => r.port("tracker", { comment: method }) });

    await mount([tracker, workflow], {}, HOST);

    const comment = (context!.port("tracker") as { comment: (() => Promise<void>) & Record<symbol, unknown> }).comment;
    expect(comment[Symbol.for("amykit.acceptsAction")]).toBe(true);
    expect(Object.getOwnPropertySymbols(comment)).not.toContain(privateMarker);
  });

  it("attenuates a full mutable contract mounted only under a consumer alias", async () => {
    let context: PluginContext | undefined;
    let merges = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow({ ...WORKFLOW, codeHostWrites: [] }); context = ctx; },
    });
    const forge = plugin("@amykit/plugin-forge", {
      register: (r) => r.port("forge", { findPullRequest: async () => null, merge: async () => { merges += 1; } }),
    });

    await mount([forge, workflow], {}, HOST);

    await expect((context!.port("forge") as { merge(): Promise<void> }).merge()).rejects.toThrow("merge");
    expect(merges).toBe(0);
  });

  it("does not expose an unrecognised mutator mounted only under a consumer alias", async () => {
    let context: PluginContext | undefined;
    let mutations = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow({ ...WORKFLOW, trackerWrites: [], codeHostWrites: [] }); context = ctx; },
    });
    const forge = plugin("@amykit/plugin-forge", {
      register: (r) => r.port("forge", { mutate: async () => { mutations += 1; } }),
    });

    await mount([forge, workflow], {}, HOST);

    const port = context!.port("forge") as { mutate?: () => Promise<void> };
    expect(port.mutate).toBeUndefined();
    expect(mutations).toBe(0);
  });

  it("does not expose helpers on a read-only tracker adapter", async () => {
    let context: PluginContext | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { get: async () => null, mutate: async () => { throw new Error("called"); } }),
    });

    await mount([workflow, tracker], {}, HOST);

    const port = context!.port("tracker") as { get(): Promise<null>; mutate?: () => Promise<void> };
    await expect(port.get()).resolves.toBeNull();
    expect(port.mutate).toBeUndefined();
    expect(Object.getPrototypeOf(port)).toBeNull();
  });

  it("does not expose an unrecognised mutator on a workflow tracker port", async () => {
    let context: PluginContext | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { mutate: async () => { throw new Error("called"); } }),
    });

    await mount([workflow, tracker], {}, HOST);

    expect((context!.port("tracker") as { mutate?: () => Promise<void> }).mutate).toBeUndefined();
  });

  it("attenuates a custom brief adapter with a mutating helper", async () => {
    let context: PluginContext | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow({ ...WORKFLOW, trackerWrites: [], codeHostWrites: [] }); context = ctx; },
    });
    const briefs = plugin("@amykit/plugin-briefs", {
      register: (r) => r.port("brief", { get: async () => null, mutate: async () => { throw new Error("called"); } }),
    });

    await mount([workflow, briefs], {}, HOST);

    const brief = context!.port("brief") as { mutate?: () => Promise<void> };
    expect(brief.mutate).toBeUndefined();
  });

  it("attenuates an unrecognised mutator mounted only under a tracker-shaped alias", async () => {
    let context: PluginContext | undefined;
    let mutations = 0;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => { r.workflow({ ...WORKFLOW, trackerWrites: [] }); context = ctx; },
    });
    const feature = plugin("@amykit/plugin-feature", {
      register: (r) => {
        const adapter = { get: async () => null, mutate: async () => { mutations += 1; } };
        r.port("feature", adapter);
        r.action("feature-mutate", { port: "feature", method: "mutate" }, adapter);
      },
    });

    await mount([workflow, feature], {}, HOST);

    const port = context!.workflowPort!("feature") as { get(): Promise<null>; mutate?: () => Promise<void> };
    await expect(port.get()).resolves.toBeNull();
    expect(port.mutate).toBeUndefined();
    expect(mutations).toBe(0);
  });

  it("attenuates a mutable tracker mounted under a read-seam alias", async () => {
    let context: PluginContext | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => {
        const adapter = { get: async () => null, comment: async () => { throw new Error("called"); } };
        r.port("tracker", adapter);
        r.port("feature", adapter);
      },
    });

    await mount([workflow, tracker], {}, HOST);

    await expect((context!.port("feature") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });

  it("preserves a mutable kind when a provider re-exports its deferred alias", async () => {
    let context: PluginContext | undefined;
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: async () => { throw new Error("called"); } }),
    });
    const composer = plugin("@amykit/plugin-composer", {
      register: (r, ctx) => r.port("grooming-tracker", ctx.port("tracker")!),
    });
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        context = ctx;
      },
    });

    await mount([tracker, composer, workflow], {}, HOST);

    await expect((context!.port("grooming-tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });

  it("leaves an independent feature seam available to the plugin that composes it", async () => {
    let captured: object | undefined;
    let comments = 0;
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, trackerWrites: [] }) });
    const action = plugin("@amykit/plugin-feature-grooming", { register: (_r, ctx) => { captured = ctx.port("feature"); } });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => {
        const adapter = { createGroomedWork: async () => { comments += 1; } };
        r.port("tracker", adapter);
        r.port("feature", adapter);
      },
    });

    await mount([workflow, tracker, action], {}, HOST);

    await (captured as { createGroomedWork(): Promise<void> }).createGroomedWork();
    expect(comments).toBe(1);
  });

  it("attenuates a mutable adapter implicitly mounted by an action alias", async () => {
    let engineContext: PluginContext | undefined;
    const engine = plugin("@amykit/plugin-engine", { register: (_r, ctx) => { engineContext = ctx; } });
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, trackerWrites: [] }) });
    const action = plugin("@amykit/plugin-action", {
      register: (r) => r.action("plugin-comment", { port: "feature", method: "comment" }, { comment: async () => {} }),
    });

    await mount([engine, workflow, action], {}, HOST);

    await expect((engineContext!.workflowPort!("feature") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });

  it("attenuates an existing adapter when an action binds it through an alias", async () => {
    let engineContext: PluginContext | undefined;
    const engine = plugin("@amykit/plugin-engine", { register: (_r, ctx) => { engineContext = ctx; } });
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, codeHostWrites: [] }) });
    const host = plugin("@amykit/plugin-code-host", {
      register: (r) => r.port("forge", { merge: async () => { throw new Error("called"); } }),
    });
    const action = plugin("@amykit/plugin-action", {
      register: (r) => r.action("plugin-merge", { port: "forge", method: "merge" }, {}),
    });

    await mount([engine, workflow, host, action], {}, HOST);

    await expect((engineContext!.workflowPort!("forge") as { merge(): Promise<void> }).merge()).rejects.toThrow("merge");
  });

  it("gives the serial engine the workflow's narrowed port rather than its own full context", async () => {
    let engineContext: PluginContext | undefined;
    const engine = plugin("@amykit/plugin-engine", { register: (_r, ctx) => { engineContext = ctx; } });
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, trackerWrites: [] }) });
    const tracker = plugin("@amykit/plugin-tracker", { register: (r) => r.port("tracker", { comment: async () => {} }) });

    await mount([engine, workflow, tracker], {}, HOST);

    await expect((engineContext!.workflowPort!("tracker") as { comment(): Promise<void> }).comment()).rejects.toThrow("comment");
  });

  it("keeps acceptsAction markers when the engine reaches a claimed writer", async () => {
    let engineContext: PluginContext | undefined;
    let calls = 0;
    const engine = plugin("@amykit/plugin-engine", { register: (_r, ctx) => { engineContext = ctx; } });
    const workflow = plugin("@amykit/workflow-toy", { register: (r) => r.workflow({ ...WORKFLOW, trackerWrites: ["comment"] }) });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", { comment: acceptsAction(async () => { calls += 1; }) }),
    });

    await mount([engine, workflow, tracker], {}, HOST);
    const context: ActionContext = {
      record: { id: "t", state: "START", updatedAt: "", attempts: {}, history: [] },
      observation: {},
      outcomes: {},
    };
    await runAction({ port: "tracker", method: "comment" }, { type: "ask-question" }, context, engineContext!.workflowPort!);

    expect(calls).toBe(1);
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

    ]);

    // `triage` is a core action, so it is defined, but nothing is the agent.
    expect(unmetNeeds(mounted, WORKFLOW)).toEqual([
      "action `triage`: needs the `agent` port, which nothing mounted",
    ]);
  });

  it("names an action nothing defines at all", async () => {
    const mounted = await mountedWith([], { "check-web-browser": HANDLED });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `check-web-browser`: nothing defines it",
    ]);
  });


  it("refuses a workflow that mutates the tracker while claiming no capability", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "ask-question": HANDLED });
    // `ask-question` is a core tracker action, so it is defined and its port
    // is mounted; the refusal is the undeclared write alone.
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `ask-question` writes the tracker (`comment`), " +
        "but the workflow does not claim that capability — add `comment` to its `trackerWrites`",
    ]);
  });

  it("refuses every tracker mutation a core action performs", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "hand-off-to-qa": HANDLED });
    const workflow = { ...WORKFLOW, trackerWrites: ["set-status"] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `hand-off-to-qa` writes the tracker (`assign`), " +
        "but the workflow does not claim that capability — add `assign` to its `trackerWrites`",
    ]);
  });

  it("refuses a workflow that mutates the code host while claiming no capability", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("code-host", {}) }),
    ], { "open-pull-request": HANDLED });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `open-pull-request` writes the code-host (`open-pull-request`), " +
        "but the workflow does not claim that capability — add `open-pull-request` to its `codeHostWrites`",
    ]);
  });

  it("refuses at boot a plugin-bound code-host writer the workflow did not claim", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-code-host", {
        register: (r) => r.action("plugin-merge", { port: "code-host", method: "merge" }, { merge: acceptsAction(async () => {}) }),
      }),
    ], { "plugin-merge": { port: "code-host", method: "merge" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `plugin-merge` writes the code-host (`merge`), " +
        "but the workflow does not claim that capability — add `merge` to its `codeHostWrites`",
    ]);
  });

  it("validates a core-named port binding by its actual method", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-code-host", {
        register: (r) => {
          r.port("code-host", { merge: acceptsAction(async () => {}) });
          r.action("open-pull-request", { port: "code-host", method: "merge" }, {});
        },
      }),
    ], { "open-pull-request": { port: "code-host", method: "merge" } });
    const workflow = { ...WORKFLOW, codeHostWrites: ["open-pull-request"] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `open-pull-request` writes the code-host (`merge`), " +
        "but the workflow does not claim that capability — add `merge` to its `codeHostWrites`",
    ]);
  });

  it("refuses a code-host writer bound to the tracker rather than accepting its foreign claim", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-tracker", {
        register: (r) => r.action("plugin-merge", { port: "tracker", method: "merge" }, { merge: acceptsAction(async () => {}) }),
      }),
    ], { "plugin-merge": { port: "tracker", method: "merge" } });
    const workflow = { ...WORKFLOW, codeHostWrites: ["merge"] };

    expect(unmetNeeds(mounted, workflow)).toContain(
      "action `plugin-merge` binds the tracker port to `merge`, a write only the code-host contract defines",
    );
  });

  it("refuses at boot a plugin-bound writer through a consumer-named alias", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-tracker", {
        register: (r) => r.action("plugin-comment", { port: "feature", method: "comment" }, { comment: acceptsAction(async () => {}) }),
      }),
    ], { "plugin-comment": { port: "feature", method: "comment" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `plugin-comment` writes the tracker (`comment`), " +
        "but the workflow does not claim that capability — add `comment` to its `trackerWrites`",
    ]);
  });

  it("refuses an action-mounted writer with no mutable core contract", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-unknown-writer", {
        register: (r) => r.action("plugin-mutate", { port: "forge", method: "mutate" }, {
          mutate: acceptsAction(async () => {}),
        }),
      }),
    ], { "plugin-mutate": { port: "forge", method: "mutate" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      expect.stringContaining("action `plugin-mutate` binds unrecognised mutable port `forge.mutate`"),
    ]);
  });

  it("refuses a runtime-only binding to an unrecognised mutable alias", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-unknown-writer", {
        register: (r) => r.port("forge", { mutate: acceptsAction(async () => {}) }),
      }),
    ], { "plugin-mutate": { port: "forge", method: "mutate" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      expect.stringContaining("action `plugin-mutate` binds unrecognised mutable port `forge.mutate`"),
    ]);
  });

  it("refuses a runtime-only unknown method bound directly to the tracker", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-tracker", {
        register: (r) => r.port("tracker", { mutate: acceptsAction(async () => {}) }),
      }),
    ], { "plugin-mutate": { port: "tracker", method: "mutate" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      expect.stringContaining("action `plugin-mutate` binds unrecognised mutable port `tracker.mutate`"),
    ]);
  });

  it("refuses at boot a runtime-only writer through a consumer-named alias", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-code-host", {
        register: (r) => r.port("forge", { merge: acceptsAction(async () => {}) }),
      }),
    ], { merge: { port: "forge", method: "merge" } });
    const workflow = { ...WORKFLOW };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `merge` writes the code-host (`merge`), " +
        "but the workflow does not claim that capability — add `merge` to its `codeHostWrites`",
    ]);
  });

  it("refuses a claimed capability no mounted code host could honour", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("agent", {}) }),
    ], { triage: HANDLED });
    const workflow = { ...WORKFLOW, codeHostWrites: ["delete-everything"] };

    expect(unmetNeeds(mounted, workflow)[0]).toContain("the workflow claims the code-host write `delete-everything`");
  });

  it("accepts the claim a workflow makes for the writes it uses", async () => {
    const mounted = await mountedWith([
      plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) }),
    ], { "ask-question": HANDLED });
    const workflow = {
      ...WORKFLOW,
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
  const workflow = { ...WORKFLOW };
  const forge = (): Plugin =>
    plugin("@amykit/plugin-forge", { register: (r) => r.port("forge", { merge: acceptsAction(async () => 7) }) });

  it("refuses at boot an action declared with nothing behind it, naming it", async () => {
    const host = await mounted([plugin("@amykit/plugin-a", { register: (r) => r.port("tracker", {}) })], {
      "hand-off-to-qa": undefined,
    });

    expect(unmetNeeds(host, { ...workflow, trackerWrites: ["set-status"] })).toEqual([
      "action `hand-off-to-qa` is declared with no implementation — give it a handler, or a port and a method",
      "action `hand-off-to-qa` writes the tracker (`assign`), " +
        "but the workflow does not claim that capability — add `assign` to its `trackerWrites`",
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
    expect(unmetNeeds(host, { ...workflow, codeHostWrites: ["merge"] })).toEqual([]);

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
    expect(unmetNeeds(host, { ...workflow, codeHostWrites: ["merge"] })).toEqual([]);

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
  it("lets a host require a workflow without changing ordinary plugin-only mounts", async () => {
    const outcome = await mount([plugin("@amykit/plugin-only")], {}, HOST, { workflowLabel: "brief/" });

    expect(outcome).toMatchObject({ ok: false, problems: ["brief/: exports no workflow"] });
  });

  it("requires the configured plugin rather than a workflow another plugin contributes", async () => {
    const configured = plugin("@acme/brief");
    const unrelated = plugin("@acme/workflow", { register: (r) => r.workflow(WORKFLOW) });

    const outcome = await mount([configured, unrelated], {}, HOST, {
      workflowLabel: "brief/",
      workflowPlugin: configured,
    });

    expect(outcome).toMatchObject({ ok: false, problems: ["brief/: exports no workflow"] });
  });

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

describe("a deferred implementation", () => {
  it("mounts a port that needs a port listed after it, and hands it that port", async () => {
    let seen: object | undefined;
    const early = plugin("@amykit/plugin-early", {
      register: (r, ctx) => r.port("agent", deferred(() => {
        seen = ctx.port("gate");
        return { ask: async () => "answered" };
      })),
    });
    const late = plugin("@amykit/plugin-late", { register: (r) => r.port("gate", { id: "gate" }) });

    const outcome = await mount([early, late], {}, HOST);

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(seen).toEqual({ id: "gate" });
  });

  it("hands every reader the built object, never the factory", async () => {
    const runtime = { policy: {} };
    const engine = { discover: async () => [], tick: async () => undefined };
    let read: { port?: object; contribution?: object } = {};
    const provider = plugin("@amykit/plugin-provider", {
      register: (r) => {
        r.port("agent", deferred(() => ({ ask: async () => "answered" })));
        r.contribute(WORKFLOW_RUNTIME, "toy", deferred(() => runtime));
        r.engine(deferred(() => engine));
      },
    });
    const reader = plugin("@amykit/plugin-reader", {
      ready: (ctx) => {
        read = { port: ctx.port("agent"), contribution: ctx.contributions(WORKFLOW_RUNTIME).get("toy") };
      },
    });

    const outcome = await mount([reader, provider], {}, HOST);

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(typeof (read.port as { ask?: unknown }).ask).toBe("function");
    expect(read.contribution).toBe(runtime);
    expect(outcome.mounted.engine).toBe(engine);
    expect(outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("toy")).toBe(runtime);
    expect(typeof (outcome.mounted.ports.get("agent") as { ask?: unknown }).ask).toBe("function");
  });

  it("builds before any `ready`, so a `ready` judges what was built", async () => {
    const order: string[] = [];
    const judge = plugin("@amykit/plugin-judge", { ready: () => { order.push("ready"); } });
    const built = plugin("@amykit/plugin-built", {
      register: (r) => r.port("gate", deferred(() => {
        order.push("built");
        return {};
      })),
    });

    await mount([judge, built], {}, HOST);

    expect(order).toEqual(["built", "ready"]);
  });

  it("leaves a contribution that is itself a function exactly as it was given", async () => {
    const handler = () => "a function, not a factory";
    let read: object | undefined;
    const provider = plugin("@amykit/plugin-provider", { register: (r) => r.contribute("handlers", "one", handler) });
    const reader = plugin("@amykit/plugin-reader", { ready: (ctx) => { read = ctx.contributions("handlers").get("one"); } });

    await mount([provider, reader], {}, HOST);

    expect(read).toBe(handler);
  });

  it("refuses a build that throws at boot, naming its plugin", async () => {
    const broken = plugin("@amykit/plugin-broken", {
      register: (r) => r.port("agent", deferred(() => {
        throw new Error("the ladder names `claude:opuss`, which no harness contributed");
      })),
    });

    const outcome = await mount([broken], {}, HOST);

    expect(outcome).toEqual({
      ok: false,
      problems: ["@amykit/plugin-broken: failed to mount — the ladder names `claude:opuss`, which no harness contributed"],
    });
  });

  it("refuses only the build that threw, not the ones that read it", async () => {
    const broken = plugin("@amykit/plugin-broken", {
      register: (r) => r.port("gate", deferred(() => {
        throw new Error("no command configured");
      })),
    });
    const reader = plugin("@amykit/workflow-reader", {
      register: (r, ctx) => r.contribute(WORKFLOW_RUNTIME, "toy", deferred(() => ({ gate: ctx.port("gate") }))),
    });

    const outcome = await mount([reader, broken], {}, HOST);

    expect(outcome).toEqual({ ok: false, problems: ["@amykit/plugin-broken: failed to mount — no command configured"] });
  });

  it("refuses two builds that read each other, naming both", async () => {
    const first = plugin("@amykit/plugin-first", {
      register: (r, ctx) => r.port("agent", deferred(() => ({ gate: ctx.port("gate") }))),
    });
    const second = plugin("@amykit/plugin-second", {
      register: (r, ctx) => r.port("gate", deferred(() => ({ agent: ctx.port("agent") }))),
    });

    const outcome = await mount([first, second], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems).toEqual([
      "@amykit/plugin-first (the `agent` port) and @amykit/plugin-second (the `gate` port) each need what the other builds, so neither can be built",
    ]);
  });

  it("refuses a build that reads itself", async () => {
    const selfish = plugin("@amykit/plugin-selfish", {
      register: (r, ctx) => r.port("agent", deferred(() => ({ agent: ctx.port("agent") }))),
    });

    const outcome = await mount([selfish], {}, HOST);

    expect(outcome.ok === false && outcome.problems).toEqual([
      "@amykit/plugin-selfish (the `agent` port): reads itself while it is being built",
    ]);
  });

  it("refuses a read during `register`, when what it needs may not exist yet", async () => {
    const provider = plugin("@amykit/plugin-provider", { register: (r) => r.port("agent", deferred(() => ({}))) });
    const eager = plugin("@amykit/plugin-eager", { register: (_r, ctx) => { ctx.port("agent"); } });

    const outcome = await mount([provider, eager], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "@amykit/plugin-eager: failed to mount — the `agent` port of @amykit/plugin-provider is built once every plugin has registered",
    );
  });

  it("refuses a build that returns a promise rather than an implementation", async () => {
    const asynchronous = plugin("@amykit/plugin-async", {
      register: (r) => r.port("agent", deferred(() => Promise.resolve({}))),
    });

    const outcome = await mount([asynchronous], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("returned a promise");
  });

  it("refuses a factory that rejects without leaving the rejection unhandled", async () => {
    // Vitest fails the run on an unhandled rejection, which is the half of
    // this the assertion below cannot see.
    const rejecting = plugin("@amykit/plugin-rejecting", {
      register: (r) => r.port("agent", deferred((async () => { throw new Error("failed"); }) as () => object)),
    });

    const outcome = await mount([rejecting], {}, HOST);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(outcome.ok === false && outcome.problems[0]).toContain("returned a promise");
  });

  it("lets one member of a collection read a sibling while it builds", async () => {
    let built: object | undefined;
    const provider = plugin("@amykit/plugin-provider", {
      register: (r, ctx) => {
        r.contribute("handlers", "a", deferred(() => ({ uses: ctx.contributions("handlers").get("b") })));
        r.contribute("handlers", "b", deferred(() => ({ name: "b" })));
      },
      ready: (ctx) => { built = ctx.contributions("handlers").get("a"); },
    });

    const outcome = await mount([provider], {}, HOST);

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(built).toEqual({ uses: { name: "b" } });
  });

  it("builds each mount its own instance, exactly once, when two hosts mount in one process", async () => {
    let builds = 0;
    const shared = plugin("@amykit/plugin-shared", {
      register: (r) => r.port("agent", deferred(() => ({ instance: ++builds }))),
    });
    const readsTwice = plugin("@amykit/plugin-reader", {
      register: (r, ctx) => r.contribute("readers", "twice", deferred(() => ({ a: ctx.port("agent"), b: ctx.port("agent") }))),
      ready: (ctx) => { ctx.port("agent"); },
    });

    const first = await mount([readsTwice, shared], {}, HOST);
    const second = await mount([readsTwice, shared], {}, HOST);

    if (!first.ok || !second.ok) throw new Error("both mounts should have worked");
    expect(builds).toBe(2);
    expect(first.mounted.ports.get("agent")).toEqual({ instance: 1 });
    expect(second.mounted.ports.get("agent")).toEqual({ instance: 2 });
    expect(first.mounted.contributions.get("readers")?.get("twice")).toEqual({ a: { instance: 1 }, b: { instance: 1 } });
  });

  it("still attenuates a deferred tracker for the workflow that reads it", async () => {
    let comments = 0;
    let port: { comment(): Promise<void> } | undefined;
    const workflow = plugin("@amykit/workflow-toy", {
      register: (r, ctx) => {
        r.workflow({ ...WORKFLOW, trackerWrites: [] });
        r.contribute(WORKFLOW_RUNTIME, "toy", deferred(() => {
          port = ctx.port("tracker") as typeof port;
          return {};
        }));
      },
    });
    const tracker = plugin("@amykit/plugin-tracker", {
      register: (r) => r.port("tracker", deferred(() => ({ comment: async () => { comments += 1; } }))),
    });

    const outcome = await mount([workflow, tracker], {}, HOST);

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    await expect(port!.comment()).rejects.toThrow("comment");
    expect(comments).toBe(0);
  });

  it("refuses a deferred port handed to `action`, which binds a built one", async () => {
    const binder = plugin("@amykit/plugin-binder", {
      register: (r) => r.action("page", { port: "pager", method: "page" }, deferred(() => ({ page: async () => undefined }))),
    });

    const outcome = await mount([binder], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("the action `page` needs a built port");
  });
});

describe("a workflow drawn as a diagram", () => {
  const DRAWN = "stateDiagram-v2\n    [*] --> QUEUED\n    QUEUED --> WORKING\n    WORKING --> ASKED: needs the owner\n    ASKED --> WORKING\n    WORKING --> DONE\n    DONE --> [*]\n    class QUEUED waiting\n    class ASKED attention\n";

  /** A directory holding a workflow's entry and, when given one, its diagram — the shape a host finds on disk. */
  function directory(diagram?: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-drawn-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "index.js"), "");
    if (diagram !== undefined) fs.writeFileSync(path.join(root, DIAGRAM_FILE), diagram);
    return path.join(root, "dist", "index.js");
  }

  function declaring(lists: { states?: readonly [string, ...string[]]; waiting?: string[]; terminal?: string[] } = {}) {
    return defineWorkflow({
      name: "drawn",
      ...lists,
      configSchema: {},
      policy: {},
      needs: {},
      plan: () => ({ kind: "settled", why: "drawn" }),
      record: () => ({}),
      runtime: () => ({ found: async () => [], observe: async () => ({}), actions: {}, apply: (record) => record }),
    });
  }

  it("mounts with the states the file beside it draws, and declares none", async () => {
    const outcome = await mount([withDiagramBeside(declaring(), directory(DRAWN))], {}, HOST);

    expect(outcome.ok).toBe(true);
    const workflow = outcome.ok ? outcome.mounted.workflow : undefined;
    expect(workflow?.states).toEqual(["QUEUED", "WORKING", "ASKED", "DONE"]);
    expect(workflow?.initialState).toBe("QUEUED");
    expect(workflow?.terminalStates).toEqual(["DONE"]);
    expect(workflow?.waitingStates).toEqual(["QUEUED", "ASKED"]);
    expect(workflow?.diagram?.text).toBe(DRAWN);
  });

  it("starts a record in the state the diagram starts in", () => {
    const drawn = withDiagramBeside(declaring(), directory(DRAWN));

    expect(drawn.newRecord("w-1", new Date(0)).state).toBe("QUEUED");
  });

  it("refuses one that declares its states as well as drawing them, naming the workflow and the fields", async () => {
    const outcome = await mount([withDiagramBeside(declaring({ states: ["QUEUED", "DONE"], terminal: ["DONE"] }), directory(DRAWN))], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("\n")).toMatch(/the drawn workflow draws its states in workflow\.mmd and declares `states`, `terminal` as well/);
  });

  it("refuses a diagram it cannot read with the file and the line", async () => {
    const entry = directory("stateDiagram-v2\n[*] --> A\nstate pick <<choice>>\nA --> [*]\n");
    const outcome = await mount([withDiagramBeside(declaring(), entry)], {}, HOST);

    expect(outcome.ok === false && outcome.problems.join("\n")).toMatch(/workflow\.mmd line 3: `<<choice>>` is not read/);
  });

  it("refuses a declaration with neither a diagram nor states, and says so when it is read", async () => {
    const bare = withDiagramBeside(declaring(), directory());
    const outcome = await mount([bare], {}, HOST);

    expect(outcome.ok === false && outcome.problems.join("\n")).toMatch(/has no workflow\.mmd beside it and declares no `states`/);
    expect(() => bare.workflow).toThrow(/has no workflow\.mmd beside it/);
  });

  it("refuses a workflow registered by hand with a diagram beside it", async () => {
    const byHand = plugin("workflow-by-hand", { register: (registry) => registry.workflow(WORKFLOW) });
    const outcome = await mount([withDiagramBeside(byHand, directory(DRAWN))], {}, HOST);

    expect(outcome.ok === false && outcome.problems.join("\n")).toMatch(/workflow-by-hand registers its workflow by hand and has .*workflow\.mmd beside it/);
  });

  it("keeps a workflow without a diagram exactly as it declared itself", async () => {
    const byHand = plugin("workflow-by-hand", { register: (registry) => registry.workflow(WORKFLOW) });
    const kept = withDiagramBeside(byHand, directory());
    const outcome = await mount([kept], {}, HOST);

    expect(kept).toBe(byHand);
    expect(outcome.ok === true && outcome.mounted.workflow?.states).toEqual(["START", "DONE"]);
    expect(outcome.ok === true && outcome.mounted.workflow?.diagram).toBeUndefined();
  });

  it("finds the diagram beside a local workflow's own entry, and at a package's root", () => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), "amy-local-"));
    fs.writeFileSync(path.join(local, "index.ts"), "");
    fs.writeFileSync(path.join(local, DIAGRAM_FILE), DRAWN);

    expect(diagramBeside(pathToFileURL(path.join(local, "index.ts")))?.path).toBe(path.join(local, DIAGRAM_FILE));
    expect(diagramBeside(directory(DRAWN))?.text).toBe(DRAWN);
    expect(diagramBeside(directory())).toBeUndefined();
  });
});
