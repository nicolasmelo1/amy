import { describe, it, expect } from "vitest";
import {
  Engine,
  HostServices,
  Plugin,
  WORKFLOW_RUNTIME,
  WorkRecord,
  WorkflowRuntime,
  mount,
} from "@amy/core";
import { plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", state: "/w/.amy" },
};

// The engine's own settings, and there is nothing about a ticket in them any
// more: `repos` and `qaStatusName` are the workflow's vocabulary and live in
// the workflow's slice.
const SETTINGS = {
  "@amy/plugin-serial-engine": { maxItemAttempts: 3 },
};

/** A workflow, and no way to run it. Half of the pair an engine needs. */
const halfAWorkflow: Plugin = {
  name: "@amy/workflow-half",
  version: "0.1.0",
  register: (registry) =>
    registry.workflow({
      name: "half",
      states: ["NEW"],
      waitingStates: [],
      initialState: "NEW",
      terminalStates: [],
      usesActions: [],
      usesObservers: [],
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
  name: "@amy/workflow-stub",
  version: "0.1.0",
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
      handlers: () => ({}),
      apply: (record: WorkRecord) => record,
    } satisfies WorkflowRuntime);
  },
};

async function mountAlone(extra: Plugin[] = []) {
  const outcome = await mount([plugin, ...extra], SETTINGS, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted;
}

describe("the serial engine plugin", () => {
  it("mounts an engine and nothing else", async () => {
    const mounted = await mountAlone();

    expect(typeof mounted.engine?.tick).toBe("function");
    // Deliberately not this plugin's job any more. An engine that registered
    // the workflow was an engine that had decided which one it drives.
    expect(mounted.workflow).toBeUndefined();
  });

  it("refuses to run without a workflow, rather than throwing on undefined", async () => {
    const mounted = await mountAlone();

    await expect((mounted.engine as Engine).tick()).rejects.toThrow(
      /needs a workflow, and no plugin registered one/,
    );
  });

  // The pair is what makes a workflow driveable: the order its states happen
  // in, and how the actions in them run. Half of it is a config mistake, and
  // it costs a boot rather than somebody's ticket.
  it("refuses a workflow that contributed no runtime, and names what there was", async () => {
    const mounted = await mountAlone([halfAWorkflow]);

    await expect((mounted.engine as Engine).tick()).rejects.toThrow(
      /`half` contributed no runtime/,
    );
  });

  it("mounts without the ports it will need, and complains only when used", async () => {
    // Deliberate: the ports come from plugins that may be listed after this
    // one, so demanding them at mount would make the config order matter.
    const mounted = await mountAlone([stubWorkflow]);

    await expect((mounted.engine as Engine).tick()).rejects.toThrow(
      /needs the `queue` port, and nothing mounted it/,
    );
  });

  it("names the missing port, not a property of undefined", async () => {
    const withQueue = await mountAlone([
      stubWorkflow,
      {
        name: "@amy/plugin-q",
        version: "0.1.0",
        register: (r) => r.queue({} as never),
      },
    ]);

    await expect((withQueue.engine as Engine).tick()).rejects.toThrow(/needs the `store` port/);
  });
});
