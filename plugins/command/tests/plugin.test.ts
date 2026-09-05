import { describe, it, expect } from "vitest";
import { Commands, HostServices, mount } from "@amy/core";
import { ScriptedRunner } from "@amy/test-fixtures";
import { plugin } from "../src/plugin.js";

function hostWith(runner: ScriptedRunner): HostServices {
  return {
    runner,
    now: () => new Date("2026-09-04T20:00:00.000Z"),
    paths: { workspace: "/checkouts", state: "/state" },
  };
}

async function mounted(settings: Record<string, unknown> = {}) {
  const runner = new ScriptedRunner([]);
  const outcome = await mount([plugin], { "@amy/plugin-command": settings }, hostWith(runner));
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));

  return { runner, mounted: outcome.mounted };
}

describe("mounting the command adapter", () => {
  it("brings the action and the port that runs it together", async () => {
    const { mounted: host } = await mounted({ allow: {} });

    expect(host.actions.get("run-command")).toEqual({ port: "commands", method: "run" });
    expect(host.ports.has("commands")).toBe(true);
  });

  it("allows only what the config named", async () => {
    const { mounted: host } = await mounted({ allow: { datadog: "pup monitors list" } });

    expect((host.ports.get("commands") as Commands).available()).toEqual(["datadog"]);
  });

  it("runs in the state directory when the config named none", async () => {
    const { runner, mounted: host } = await mounted({ allow: { datadog: "pup" } });

    await (host.ports.get("commands") as Commands).run("datadog");

    expect(runner.calls[0]?.options?.cwd).toBe("/state");
  });

  it("refuses a setting that is not one this plugin has", async () => {
    const outcome = await mount(
      [plugin],
      { "@amy/plugin-command": { allw: {} } },
      hostWith(new ScriptedRunner([])),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("allw");
  });
});
