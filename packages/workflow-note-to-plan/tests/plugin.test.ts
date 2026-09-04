import { describe, it, expect } from "vitest";
import { HostServices, Plugin, WORKFLOW_RUNTIME, mount, unmetNeeds } from "@amy/core";
import { plugin as noteToPlan } from "../src/plugin.js";

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-04T20:00:00.000Z"),
  paths: { workspace: "/checkouts", state: "/state" },
};

/** A plugin that mounts one port, so a test can leave exactly one out. */
function mounts(name: string, kind: string, impl: object = {}): Plugin {
  return { name, version: "0.1.0", register: (registry) => registry.port(kind, impl) };
}

const PORTS = [
  mounts("notes", "notes", { all: () => [], get: () => null, write: () => null }),
  mounts("agent", "agent", { name: "relay", ask: async () => null }),
  mounts("check", "plan-check", { check: async () => null }),
  mounts("forge", "code-host", {}),
  mounts("notifier", "notifier", { announce: async () => undefined }),
  mounts("store", "store", { all: () => [], load: () => null, save: () => undefined }),
];

const SETTINGS = { "@amy/workflow-note-to-plan": { repos: ["acme/widgets"] } };

function assemble(plugins: Plugin[] = PORTS, settings: Record<string, unknown> = SETTINGS) {
  return mount([noteToPlan, ...plugins], settings, host);
}

describe("mounting the workflow", () => {
  it("registers the workflow, so an engine has an order to follow", async () => {
    const outcome = await assemble();

    expect(outcome.ok === true && outcome.mounted.workflow?.name).toBe("note-to-plan");
  });

  it("contributes a runtime under the workflow's own name", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect([...outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.keys()]).toEqual([
      "note-to-plan",
    ]);
  });

  it("leaves nothing it named unmet, once every port is there", async () => {
    // `check-plan` is deliberately absent here: it is not a core action, and
    // the plugin that runs it brings it. This proves the rest.
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const unmet = unmetNeeds(outcome.mounted, outcome.mounted.workflow!);
    expect(unmet).toEqual(["action `check-plan`: nothing defines it"]);
  });

  it("refuses a mount with no notes, naming the port", async () => {
    const outcome = await assemble(PORTS.filter((p) => p.name !== "notes"));

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "needs the `notes` port, and nothing mounted it",
    );
  });

  it("refuses a mount with no agent, naming the port", async () => {
    const outcome = await assemble(PORTS.filter((p) => p.name !== "agent"));

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "needs the `agent` port, and nothing mounted it",
    );
  });

  it("refuses a mount with no check, naming the port", async () => {
    const outcome = await assemble(PORTS.filter((p) => p.name !== "check"));

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "needs the `plan-check` port, and nothing mounted it",
    );
  });

  it("refuses a config that does not say which repositories it may write into", async () => {
    const outcome = await assemble(PORTS, {});

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("repos");
  });

  it("keeps two mounts apart, so one host cannot answer with another's ports", async () => {
    const first = await assemble();
    const second = await assemble();

    expect(first.ok && second.ok).toBe(true);
    expect(
      first.ok === true &&
        second.ok === true &&
        first.mounted.contributions.get(WORKFLOW_RUNTIME)!.get("note-to-plan") !==
          second.mounted.contributions.get(WORKFLOW_RUNTIME)!.get("note-to-plan"),
    ).toBe(true);
  });
});

describe("what the workflow says it needs", () => {
  it("names four actions and no observation slice", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.workflow!.usesActions).toEqual([
      "draft-plan",
      "check-plan",
      "open-pull-request",
      "announce",
    ]);
    expect(outcome.mounted.workflow!.usesObservers).toEqual([]);
  });

  it("shares three of them with the ticket workflow rather than declaring its own", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const core = ["draft-plan", "open-pull-request", "announce"];
    for (const action of core) {
      expect(outcome.mounted.actions.has(action)).toBe(true);
    }
  });
});
