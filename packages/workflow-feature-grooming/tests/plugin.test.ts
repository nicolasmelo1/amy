import { describe, expect, it } from "vitest";
import { call, declaredCallee, mount, withDiagramBeside, type HostServices, type Plugin } from "@amykit/core";
import { plugin as declared } from "../src/plugin.js";

/** The workflow as the host mounts it, shaped by the diagram at the package root. */
const plugin = withDiagramBeside(declared, import.meta.url);

const briefs: Plugin = { name: "briefs", register: (registry) => registry.port("brief", { get: async () => null }) };

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date(),
  paths: { state: "/state" },
};

describe("feature-grooming plugin", () => {
  it("mounts with the brief port alone, and mounts no port of its own", async () => {
    const outcome = await mount([briefs, plugin], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect([...outcome.mounted.ports.keys()].sort()).toEqual(["brief"]);
  });

  it("can be called, returning the criteria at BRIEFED", () => {
    expect(() => call(plugin)).not.toThrow();
    expect(declaredCallee(plugin).returns).toEqual(["BRIEFED"]);
  });

  it("refuses a mount with no brief store, by the port", async () => {
    const outcome = await mount([plugin], { "@amykit/workflow-feature-grooming": { repos: [] } }, host);

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("brief");
  });
});
