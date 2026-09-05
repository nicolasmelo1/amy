import { describe, it, expect } from "vitest";
import { HostServices, Plugin, WORKFLOW_RUNTIME, mount, unmetNeeds } from "@amykit/core";
import { plugin as errand } from "../src/plugin.js";

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-05T10:00:00.000Z"),
  paths: { workspace: "/checkouts", state: "/state" },
};

/** A plugin that mounts one port, so a test can leave exactly one out. */
function mounts(name: string, kind: string, impl: object = {}): Plugin {
  return { name, version: "0.1.0", register: (registry) => registry.port(kind, impl) };
}

const PORTS = [
  mounts("tasks", "tasks", { all: () => [], get: () => null, add: () => null }),
  mounts("agent", "agent", { name: "relay", ask: async () => null }),
  mounts("forge", "code-host", {}),
  mounts("notifier", "notifier", { announce: async () => undefined }),
  mounts("store", "store", { all: () => [], load: () => null, save: () => undefined }),
];

const SETTINGS = { "@amykit/workflow-errand": { repos: ["acme/widgets"] } };

function assemble(plugins: Plugin[] = PORTS, settings: Record<string, unknown> = SETTINGS) {
  return mount([errand, ...plugins], settings, host);
}

describe("mounting the errand workflow", () => {
  it("registers the workflow, so an engine has an order to follow", async () => {
    const outcome = await assemble();

    expect(outcome.ok === true && outcome.mounted.workflow?.name).toBe("errand");
  });

  it("contributes a runtime under the workflow's own name", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect([...outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.keys()]).toEqual(["errand"]);
  });

  it("names no action the core does not already ship", async () => {
    // The third workflow, and the one that added nothing: an errand is an
    // agent in a checkout, a pull request if it changed something, and
    // somebody being told. All three already existed.
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(unmetNeeds(outcome.mounted, outcome.mounted.workflow!)).toEqual([]);
  });

  it("refuses a mount with no tasks directory, naming the port", async () => {
    const outcome = await assemble(PORTS.filter((p) => p.name !== "tasks"));

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("`tasks` port");
  });

  it("refuses a mount with no agent, naming the port", async () => {
    const outcome = await assemble(PORTS.filter((p) => p.name !== "agent"));

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("`agent` port");
  });

  it("refuses a setting that is not one it has", async () => {
    const outcome = await assemble(PORTS, {
      "@amykit/workflow-errand": { repos: ["acme/widgets"], polcy: {} },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("polcy");
  });
});
