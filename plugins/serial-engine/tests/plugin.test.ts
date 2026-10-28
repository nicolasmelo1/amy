import { describe, it, expect } from "vitest";
import {
  Engine,
  HostServices,
  Plugin,
  WORKFLOW_RUNTIME,
  WorkRecord,
  WorkflowRuntime,
  mount,
} from "@amykit/core";
import { plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", checkouts: {}, state: "/w/.amy" },
};

// The engine's own settings, and there is nothing about a ticket in them any
// more: `repos` and `qaStatusName` are the workflow's vocabulary and live in
// the workflow's slice.
const SETTINGS = {
  "@amykit/plugin-serial-engine": { maxItemAttempts: 3 },
};

/** A workflow, and no way to run it. Half of the pair an engine needs. */
const halfAWorkflow: Plugin = {
  name: "@amykit/workflow-half",
  register: (registry) =>
    registry.workflow({
      name: "half",
      states: ["NEW"],
      waitingStates: [],
      initialState: "NEW",
      terminalStates: [],
      plan: () => ({ kind: "settled", why: "nothing to do" }),
    }),
};

/**
 * A whole pair that needs no ports at all.
 *
 * Which is the claim this engine now makes: what it drives is a workflow and
 * a runtime, and it neither knows nor cares that this one reaches nothing.
 */
const stubWorkflow: Plugin = {
  name: "@amykit/workflow-stub",
  register: (registry) => {
    halfAWorkflow.register(registry, undefined as never);
    registry.contribute(WORKFLOW_RUNTIME, "half", {
      policy: {},
      found: async () => [],
      newRecord: (workId: string, at: Date) => ({
        id: workId,
        state: "NEW",
        updatedAt: at.toISOString(),
        attempts: {},
        history: [],
      }),
      observe: async () => ({}),
      actions: {},
      apply: (record: WorkRecord) => record,
    } satisfies WorkflowRuntime);
  },
};

/** The ports an engine reaches, standing in, so only the pair is under test. */
const PORTS: Plugin = {
  name: "@amykit/plugin-ports",
  register: (registry) => {
    registry.queue({} as never);
    registry.store({} as never);
    registry.port("notifier", { announce: async () => undefined });
  },
};

async function refusal(plugins: Plugin[]): Promise<string> {
  const outcome = await mount(plugins, SETTINGS, HOST);
  if (outcome.ok) throw new Error("the mount should have been refused");
  return outcome.problems.join("\n");
}

describe("the serial engine plugin", () => {
  it("mounts an engine and nothing else", async () => {
    const outcome = await mount([plugin, stubWorkflow, PORTS], SETTINGS, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(Object.keys(outcome.mounted.engine as Engine).sort()).toEqual(["discover", "tick"]);
    // Deliberately not this plugin's job any more. An engine that registered
    // the workflow was an engine that had decided which one it drives.
    expect(outcome.mounted.workflow?.name).toBe("half");
    expect([...outcome.mounted.ports.keys()].sort()).toEqual(["notifier", "queue", "store"]);
  });

  // Behaviour change: these used to mount and fail on the first tick. The
  // engine is now a deferred implementation the host builds at boot, so each
  // of them is a boot refusal naming the plugin and what is missing.
  it("refuses at boot without a workflow, rather than throwing on undefined", async () => {
    expect(await refusal([plugin])).toMatch(
      /@amykit\/plugin-serial-engine: failed to mount — the serial engine needs a workflow, and no plugin registered one/,
    );
  });

  // The pair is what makes a workflow driveable: the order its states happen
  // in, and how the actions in them run. Half of it is a config mistake, and
  // it costs a boot rather than somebody's ticket.
  it("refuses a workflow that contributed no runtime, and names what there was", async () => {
    expect(await refusal([plugin, halfAWorkflow])).toMatch(/`half` contributed no runtime/);
  });

  it("finds the ports it needs from plugins listed after it, and refuses at boot when one is missing", async () => {
    // The ports come from plugins that may be listed after this one, and the
    // host builds the engine once all of them have registered, so the order
    // does not matter and a missing one still costs a boot.
    const listedLast = await mount([plugin, stubWorkflow, PORTS], SETTINGS, HOST);
    expect(listedLast.ok).toBe(true);

    expect(await refusal([plugin, stubWorkflow])).toMatch(/needs the `queue` port, and nothing mounted it/);
  });

  it("names the missing port, not a property of undefined", async () => {
    expect(await refusal([
      plugin,
      stubWorkflow,
      {
        name: "@amykit/plugin-q",
        register: (r) => r.queue({} as never),
      },
    ])).toMatch(/needs the `store` port/);
  });
});
