import { describe, it, expect } from "vitest";
import { HostServices, Plugin, WORKFLOW_RUNTIME, WorkflowRuntime, deferred, dispatchesTo, mount, mountedActions } from "@amykit/core";
import { fakeAgent, fakeGate, fakeHost, fakeTracker, roster } from "@amykit/test-fixtures";
import { WORKFLOW_DATA, plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", checkouts: {}, state: "/w/.amy" },
};

const SETTINGS = {
  "@amykit/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA" },
};

/** Everything this workflow reaches for, mounted by somebody else. */
const world: Plugin = {
  name: "@amykit/plugin-world",
  register: (registry) => {
    registry.port("tracker", fakeTracker());
    registry.port("code-host", fakeHost());
    registry.port("agent", fakeAgent());
    registry.port("gate", fakeGate());
    registry.port("notifier", { announce: async () => {} });
    registry.contribute(WORKFLOW_DATA, "roster", { read: () => roster() });
  },
};

const mountWith = (plugins: Plugin[]) => mount(plugins, SETTINGS, HOST);

describe("the ticket-to-qa workflow, as a plugin", () => {
  it("registers the workflow and contributes a runtime under its name", async () => {
    const outcome = await mountWith([plugin, world]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow?.name).toBe("ticket-to-qa");

    // Keyed by the workflow's own name, which is how an engine finds the
    // runtime for the workflow it was given rather than for some other one.
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("ticket-to-qa");
    expect(runtime).toBeDefined();
  });

  it("dispatches resolve-review-thread to the code-host port", async () => {
    const outcome = await mountWith([plugin, world]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const runtime = outcome.mounted.contributions
      .get(WORKFLOW_RUNTIME)
      ?.get("ticket-to-qa") as WorkflowRuntime;
    const handlers = runtime.actions;

    // The core's catalogue names the port, the runtime carries the handler,
    // and the two agree — so a mount that cannot run it is refused at boot by
    // name, and a plan that emits it is not a wish.
    expect(dispatchesTo("resolve-review-thread", "code-host")).toBe(true);
    expect(handlers["resolve-review-thread"]).toBeDefined();
    expect(outcome.mounted.actions.get("resolve-review-thread")).toMatchObject({
      port: "code-host",
      method: "resolveReviewThread",
    });
  });

  it("brings a handler for every action it declares, the last step of the happy path included", async () => {
    const outcome = await mountWith([plugin, world]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const runtime = outcome.mounted.contributions
      .get(WORKFLOW_RUNTIME)
      ?.get("ticket-to-qa") as WorkflowRuntime;
    const declared = mountedActions(outcome.mounted, outcome.mounted.workflow!);

    expect(declared).toContain("hand-off-to-qa");
    expect(declared.filter((name) => typeof runtime.actions[name] !== "function")).toEqual([]);
  });

  // The point of doing this at boot: a machine missing a plugin finds out
  // before it touches a ticket, and finds out which port is missing.
  it("refuses at boot when a port it needs was never mounted, naming it", async () => {
    const outcome = await mountWith([plugin]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.join("; ")).toMatch(/needs the `tracker` port/);
  });

  it("refuses at boot when nothing contributed today's roster", async () => {
    const withoutRoster: Plugin = {
      ...world,
      register: (registry) => {
        registry.port("tracker", fakeTracker());
        registry.port("code-host", fakeHost());
        registry.port("agent", fakeAgent());
        registry.port("gate", fakeGate());
        registry.port("notifier", { announce: async () => {} });
      },
    };

    const outcome = await mountWith([plugin, withoutRoster]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const runtime = outcome.mounted.contributions
      .get(WORKFLOW_RUNTIME)
      ?.get("ticket-to-qa") as WorkflowRuntime;

    // The roster is read when a tick needs it, not at mount, so confirming it
    // takes effect without a restart. The refusal moves with it — and names
    // the one command that writes the file, for an install that has run
    // nothing yet.
    await expect(
      runtime.observe({
        id: "PROJ-1239",
        state: "DISCOVERED",
        updatedAt: HOST.now().toISOString(),
        attempts: {},
        history: [],
      }),
    ).rejects.toThrow(/no roster was contributed/);
    await expect(
      runtime.observe({
        id: "PROJ-1239",
        state: "DISCOVERED",
        updatedAt: HOST.now().toISOString(),
        attempts: {},
        history: [],
      }),
    ).rejects.toThrow(/amy init/);
  });

  it("hands the decision the policy it was configured with", async () => {
    const outcome = await mountWith([
      plugin,
      world,
    ]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const runtime = outcome.mounted.contributions
      .get(WORKFLOW_RUNTIME)
      ?.get("ticket-to-qa") as WorkflowRuntime;

    // Defaults, because the settings above name no policy — and a policy that
    // silently arrived empty would turn every ceiling into zero.
    expect(runtime.policy).toMatchObject({ maxImplementAttempts: 3, maxGateAttempts: 3 });
  });

  it("claims no writes in operator mode and receives a tracker that refuses them", async () => {
    let tracker: { comment?: (...args: unknown[]) => Promise<unknown> } | undefined;
    const probe: Plugin = {
      name: "@amykit/plugin-probe",
      register: (registry, ctx) => registry.engine(deferred(() => {
        tracker = ctx.workflowPort?.("tracker") as typeof tracker;
        return { discover: async () => [], tick: async () => undefined };
      })),
    };
    const outcome = await mount(
      [plugin, world, probe],
      { "@amykit/workflow-ticket-to-qa": {
        ...SETTINGS["@amykit/workflow-ticket-to-qa"],
        policy: { writes: "operator" },
      } },
      HOST,
    );
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow).toMatchObject({ trackerWrites: [], codeHostWrites: [] });
    await expect(tracker?.comment?.("PROJ-1", "no")).rejects.toThrow(
      "the workflow does not claim the tracker write `comment`",
    );
  });

  it("refuses an unknown policy.conversation at boot, naming the setting and the value", async () => {
    const outcome = await mount(
      [plugin, world],
      { "@amykit/workflow-ticket-to-qa": { ...SETTINGS["@amykit/workflow-ticket-to-qa"], policy: { conversation: "chat" } } },
      HOST,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.join("; ")).toMatch(/policy\.conversation must be "answer" or "discuss", not "chat"/);
  });

  it("keeps discuss where a thread is mounted, and reads a reply as the decision where none is", async () => {
    const policyOf = async (plugins: Plugin[]) => {
      const outcome = await mount(
        plugins,
        { "@amykit/workflow-ticket-to-qa": { ...SETTINGS["@amykit/workflow-ticket-to-qa"], policy: { conversation: "discuss" } } },
        HOST,
      );
      if (!outcome.ok) throw new Error(outcome.problems.join("; "));
      const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("ticket-to-qa") as WorkflowRuntime;
      return (runtime.policy as { conversation: string }).conversation;
    };
    const thread: Plugin = {
      name: "@amykit/plugin-thread",
      register: (registry) =>
        registry.port("conversation", { open: async () => ({ id: "t" }), post: async () => "m", replies: async () => [] }),
    };

    expect(await policyOf([plugin, world, thread])).toBe("discuss");
    expect(await policyOf([plugin, world])).toBe("answer");
  });
});
