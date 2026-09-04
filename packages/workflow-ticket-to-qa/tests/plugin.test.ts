import { describe, it, expect } from "vitest";
import { HostServices, Plugin, WORKFLOW_RUNTIME, WorkflowRuntime, mount } from "@amy/core";
import { fakeAgent, fakeGate, fakeHost, fakeTracker, roster } from "@amy/test-fixtures";
import { WORKFLOW_DATA, plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", state: "/w/.amy" },
};

const SETTINGS = {
  "@amy/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA" },
};

/** Everything this workflow reaches for, mounted by somebody else. */
const world: Plugin = {
  name: "@amy/plugin-world",
  version: "0.1.0",
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

  it("brings a handler for every action the workflow says it emits", async () => {
    const outcome = await mountWith([plugin, world]);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const runtime = outcome.mounted.contributions
      .get(WORKFLOW_RUNTIME)
      ?.get("ticket-to-qa") as WorkflowRuntime;
    const handled = Object.keys(runtime.handlers());

    expect([...(outcome.mounted.workflow?.usesActions ?? [])].sort()).toEqual(handled.sort());
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
    // takes effect without a restart. The refusal moves with it.
    await expect(
      runtime.observe({
        id: "PROJ-1239",
        state: "DISCOVERED",
        updatedAt: HOST.now().toISOString(),
        attempts: {},
        history: [],
      }),
    ).rejects.toThrow(/needs `roster` in the `workflow-data` collection/);
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
});
