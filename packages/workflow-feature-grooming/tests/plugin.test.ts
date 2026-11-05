import { describe, expect, it } from "vitest";
import { mount, type HostServices, type Plugin, WORKSPACE_PORT } from "@amykit/core";
import { plugin } from "../src/plugin.js";

/** The workplace, mounted with the checkouts a test names. */
const workplace = (checkouts: Record<string, string>): Plugin => ({ name: "workspace", register: (registry) => registry.port(WORKSPACE_PORT, { workspaceRoot: "/somewhere", checkouts }) });
const workspace = workplace({});
/** The feature port grooming reads its tickets through. */
const feature: Plugin = { name: "feature", register: (registry) => registry.port("feature", {}) };

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date(),
  paths: { state: "/state" },
};

describe("feature-grooming plugin", () => {
  it("refuses a feature repository without an explicit checkout at boot", async () => {
    const outcome = await mount([feature, workspace, plugin], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);
    expect(outcome).toMatchObject({ ok: false, problems: [expect.stringContaining("configured checkout for `acme/widgets`")] });
  });

  it("mounts before the workspace's provider, the order the recommended set lists them in", async () => {
    const outcome = await mount([feature, plugin, workplace({ "acme/widgets": "/somewhere/widgets" })], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.ports.get("grooming-source")).toBeDefined();
  });

  it("still refuses a repository without a checkout at boot when the provider mounts after it", async () => {
    const outcome = await mount([feature, plugin, workspace], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("configured checkout for `acme/widgets`");
  });
});
