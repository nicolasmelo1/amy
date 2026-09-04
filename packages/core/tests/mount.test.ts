import { describe, it, expect } from "vitest";
import { Plugin, PluginContext, Workflow } from "../src/plugin.js";
import { HostServices, mount, unmetNeeds } from "../src/mount.js";

/** The services a host lends every plugin, with nothing that touches a machine. */
const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", state: "/w/.amy" },
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
  usesActions: ["triage"],
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
    const outcome = await mount([plugin("@amy/plugin-a"), plugin("@amy/plugin-b")], {}, HOST);

    expect(outcome.ok === true && outcome.mounted.plugins).toEqual([
      { name: "@amy/plugin-a", version: "0.1.0" },
      { name: "@amy/plugin-b", version: "0.1.0" },
    ]);
  });

  it("hands a plugin its own validated settings and nobody else's", async () => {
    let seen: unknown;
    const p = plugin("@amy/plugin-a", {
      configSchema: { target: { type: "string", description: "where", default: "here" } },
      register: (_r, ctx) => {
        seen = ctx.config;
      },
    });

    await mount([p], { "@amy/plugin-a": {}, "@amy/plugin-b": { other: 1 } }, HOST);

    expect(seen).toEqual({ target: "here" });
  });

  it("refuses a bad setting at boot, naming the plugin and the field", async () => {
    const p = plugin("@amy/plugin-a", {
      configSchema: { target: { type: "string", description: "where", required: true } },
    });

    const outcome = await mount([p], { "@amy/plugin-a": {} }, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems[0]).toContain("@amy/plugin-a: `target` is required");
  });

  it("does not register a plugin whose settings were refused", async () => {
    let registered = false;
    const p = plugin("@amy/plugin-a", {
      configSchema: { target: { type: "string", description: "where", required: true } },
      register: () => {
        registered = true;
      },
    });

    await mount([p], { "@amy/plugin-a": {} }, HOST);

    expect(registered).toBe(false);
  });

  it("refuses settings given to a plugin that has none", async () => {
    const outcome = await mount([plugin("@amy/plugin-a")], { "@amy/plugin-a": { target: "x" } }, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("has no settings");
  });

  it("refuses two plugins claiming the same port", async () => {
    const a = plugin("@amy/plugin-a", { register: (r) => r.port("tracker", {}) });
    const b = plugin("@amy/plugin-b", { register: (r) => r.port("tracker", {}) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "the `tracker` port is already mounted",
    );
  });

  it("refuses two workflows, because the order of actions cannot be two things", async () => {
    const a = plugin("@amy/w-a", { register: (r) => r.workflow(WORKFLOW) });
    const b = plugin("@amy/w-b", { register: (r) => r.workflow(WORKFLOW) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain("a workflow is already mounted");
  });

  it("refuses two plugins contributing the same observation", async () => {
    const source = { observe: async () => ({}) };
    const a = plugin("@amy/plugin-a", { register: (r) => r.observer("ticket", source) });
    const b = plugin("@amy/plugin-b", { register: (r) => r.observer("ticket", source) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "the `ticket` observation is already contributed",
    );
  });

  it("lets a plugin add an action the core does not have, with its port", async () => {
    const p = plugin("@amy/plugin-browser", {
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
    const a = plugin("@amy/plugin-a", { register: (r) => r.contribute("notify-channel", "hermes", {}) });
    const b = plugin("@amy/plugin-b", { register: (r) => r.contribute("notify-channel", "inbox", {}) });

    const outcome = await mount([a, b], {}, HOST);

    expect(outcome.ok === true && [...outcome.mounted.contributions.get("notify-channel")!.keys()]).toEqual([
      "hermes",
      "inbox",
    ]);
  });

  it("refuses the same name twice in one collection", async () => {
    const a = plugin("@amy/plugin-a", { register: (r) => r.contribute("notify-channel", "hermes", {}) });
    const b = plugin("@amy/plugin-b", { register: (r) => r.contribute("notify-channel", "hermes", {}) });

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
    const consumer = plugin("@amy/plugin-fanout", {
      register: (_r, ctx) => {
        captured = ctx;
      },
    });
    const later = plugin("@amy/plugin-hermes", {
      register: (r) => r.contribute("notify-channel", "hermes", {}),
    });

    await mount([consumer, later], {}, HOST);

    expect([...captured!.contributions("notify-channel").keys()]).toEqual(["hermes"]);
  });

  it("hands a plugin the services the host lends, not its own", async () => {
    let seen: { workspace: string; hasRunner: boolean } | null = null;
    const p = plugin("@amy/plugin-a", {
      register: (_r, ctx) => {
        seen = { workspace: ctx.paths.workspace, hasRunner: typeof ctx.runner.run === "function" };
      },
    });

    await mount([p], {}, HOST);

    expect(seen).toEqual({ workspace: "/w", hasRunner: true });
  });

  it("lets a plugin reach a port another plugin mounted", async () => {
    let found: object | undefined;
    const provider = plugin("@amy/plugin-a", { register: (r) => r.port("tracker", { id: 1 }) });
    const consumer = plugin("@amy/plugin-b", {
      register: (_r, ctx) => {
        found = ctx.port("tracker");
      },
    });

    await mount([provider, consumer], {}, HOST);

    expect(found).toEqual({ id: 1 });
  });
});

describe("unmetNeeds", () => {
  async function mountedWith(plugins: Plugin[]) {
    const outcome = await mount(plugins, {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    return outcome.mounted;
  }

  it("names an action whose port nothing mounted", async () => {
    const mounted = await mountedWith([
      plugin("@amy/plugin-a", { register: (r) => r.observer("ticket", { observe: async () => ({}) }) }),
    ]);

    // `triage` is a core action, so it is defined, but nothing is the agent.
    expect(unmetNeeds(mounted, WORKFLOW)).toEqual([
      "action `triage`: needs the `agent` port, which nothing mounted",
    ]);
  });

  it("names an action nothing defines at all", async () => {
    const mounted = await mountedWith([]);
    const workflow = { ...WORKFLOW, usesActions: ["check-web-browser"], usesObservers: [] };

    expect(unmetNeeds(mounted, workflow)).toEqual([
      "action `check-web-browser`: nothing defines it",
    ]);
  });

  it("names an observation nothing contributes", async () => {
    const mounted = await mountedWith([
      plugin("@amy/plugin-a", { register: (r) => r.port("agent", {}) }),
    ]);

    expect(unmetNeeds(mounted, WORKFLOW)).toEqual(["observation `ticket`: nothing contributes it"]);
  });

  it("finds nothing missing when everything the workflow named is there", async () => {
    const mounted = await mountedWith([
      plugin("@amy/plugin-a", {
        register: (r) => {
          r.port("agent", {});
          r.observer("ticket", { observe: async () => ({}) });
        },
      }),
    ]);

    expect(unmetNeeds(mounted, WORKFLOW)).toEqual([]);
  });
});

describe("a plugin that cannot mount", () => {
  it("becomes a problem with a name, not an anonymous throw", async () => {
    const broken = plugin("@amy/plugin-broken", {
      register: () => {
        throw new Error("LINEAR_API_KEY is not set");
      },
    });

    const outcome = await mount([broken], {}, HOST);

    expect(outcome.ok === false && outcome.problems[0]).toBe(
      "@amy/plugin-broken: failed to mount — LINEAR_API_KEY is not set",
    );
  });

  it("does not count as mounted", async () => {
    const broken = plugin("@amy/plugin-broken", {
      register: () => {
        throw new Error("nope");
      },
    });
    const fine = plugin("@amy/plugin-fine");

    const outcome = await mount([broken, fine], {}, HOST);

    expect(outcome.ok).toBe(false);
    // The one that worked still registered, so one bad plugin does not hide
    // the state of the others.
    expect(outcome.ok === false && outcome.problems).toHaveLength(1);
  });
});
