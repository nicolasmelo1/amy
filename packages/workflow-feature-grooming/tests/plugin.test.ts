import { describe, expect, it } from "vitest";
import { mount, type HostServices, type Plugin, WORKSPACE_PORT } from "@amykit/core";
import { plugin } from "../src/plugin.js";

/** The workplace, mounted without a named checkout for the repository asked. */
const workspace: Plugin = { name: "workspace", register: (registry) => registry.port(WORKSPACE_PORT, { workspaceRoot: "/somewhere", checkouts: {} }) };

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date(),
  paths: { state: "/state" },
};

describe("feature-grooming plugin", () => {
  it("refuses a feature repository without an explicit checkout at boot", async () => {
    const outcome = await mount([workspace, plugin], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);
    expect(outcome).toMatchObject({ ok: false, problems: [expect.stringContaining("configured checkout for `acme/widgets`")] });
  });
});
