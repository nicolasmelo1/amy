import { describe, it, expect } from "vitest";
import { HostServices, mount } from "@amy/core";
import { ScriptedRunner } from "@amy/test-fixtures";
import { PlanCheck } from "@amy/workflow-note-to-plan";
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
  const outcome = await mount([plugin], settings, hostWith(runner));
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));

  return { runner, mounted: outcome.mounted };
}

describe("mounting the check", () => {
  it("brings the action and the port that runs it together", async () => {
    // The registry asks this of any plugin adding an action the core does not
    // ship: an action nobody can execute is a promise the machine cannot keep.
    const { mounted: host } = await mounted();

    expect(host.actions.get("check-plan")).toEqual({ port: "plan-check", method: "check" });
    expect(host.ports.has("plan-check")).toBe(true);
  });

  it("runs `sf check` unless the config says otherwise", async () => {
    const { runner, mounted: host } = await mounted();

    await (host.ports.get("plan-check") as PlanCheck).check("acme/widgets");

    expect(runner.argvFor("sh")).toEqual(["-c", "sf check"]);
  });

  it("runs it in that repository's checkout, not in this one", async () => {
    const { runner, mounted: host } = await mounted();

    await (host.ports.get("plan-check") as PlanCheck).check("acme/widgets");

    expect(runner.callsTo("sh")[0]?.options?.cwd).toBe("/checkouts/widgets");
  });

  it("takes the commands the config gives it", async () => {
    const { runner, mounted: host } = await mounted({
      "@amy/plugin-plan-check": { commands: { default: ["sf check --allow-commands"] } },
    });

    await (host.ports.get("plan-check") as PlanCheck).check("acme/widgets");

    expect(runner.argvFor("sh")).toEqual(["-c", "sf check --allow-commands"]);
  });

  it("refuses a setting it does not have, so a typo costs a boot", async () => {
    const outcome = await mount(
      [plugin],
      { "@amy/plugin-plan-check": { command: "sf" } },
      hostWith(new ScriptedRunner([])),
    );

    expect(outcome.ok === false && outcome.problems.join("; ")).toContain("command");
  });
});
