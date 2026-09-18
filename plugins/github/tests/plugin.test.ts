import { describe, expect, it } from "vitest";
import { mount } from "@amykit/core";
import { plugin } from "../src/plugin.js";

/** The runner a mount never calls: registration wires the adapter only. */
const RUNNER = { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) };

describe("the github plugin", () => {
  it("declares the one setting it takes, so a typo is refused at boot", () => {
    expect(Object.keys(plugin.configSchema ?? {})).toEqual(["baseBranch"]);
  });

  it("mounts the code-host port, with the base map behind it", async () => {
    const outcome = await mount(
      [plugin],
      {
        "@amykit/plugin-github": {
          baseBranch: { "acme/widgets": "trunk" },
        },
      },
      {
        runner: RUNNER,
        now: () => new Date(),
        paths: { workspace: "/w", checkouts: {}, state: "/state" },
      },
    );

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const host = outcome.mounted.ports.get("code-host") as {
      openPullRequest: (request: { repo: string; branch: string; title: string; body: string }) => Promise<number>;
    };
    expect(host).toBeDefined();
    // The port is real; what it answers with is the adapter's tested business.
    expect(typeof host.openPullRequest).toBe("function");
  });

  it("refuses a setting that is not one it has", async () => {
    const outcome = await mount(
      [plugin],
      { "@amykit/plugin-github": { defaultBranch: "main" } },
      {
        runner: RUNNER,
        now: () => new Date(),
        paths: { workspace: "/w", checkouts: {}, state: "/state" },
      },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problems.join("\n")).toContain("`defaultBranch` is not a setting this plugin has");
    }
  });
});