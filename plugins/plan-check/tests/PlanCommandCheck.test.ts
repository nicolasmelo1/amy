import { describe, it, expect } from "vitest";
import { Git } from "@amy/core";
import { ScriptedRunner } from "@amy/test-fixtures";
import { PlanCommandCheck } from "../src/PlanCommandCheck.js";

function check(runner: ScriptedRunner, commands: Record<string, string[]>) {
  const git = new Git(runner, { workspaceRoot: "/checkouts", defaultBranch: "main" });
  return new PlanCommandCheck(runner, git, { commands });
}

describe("the check over a drafted plan", () => {
  it("runs the repository's own command in that repository's checkout", async () => {
    const runner = new ScriptedRunner([]);

    await check(runner, { default: ["sf check"] }).check("acme/widgets");

    expect(runner.calls[0]).toMatchObject({
      command: "sh",
      args: ["-c", "sf check"],
      options: { cwd: "/checkouts/widgets" },
    });
  });

  it("prefers the entry for that repository over the fallback", async () => {
    const runner = new ScriptedRunner([]);

    await check(runner, {
      "acme/widgets": ["sf check --allow-commands"],
      default: ["sf check"],
    }).check("acme/widgets");

    expect(runner.argvFor("sh")).toEqual(["-c", "sf check --allow-commands"]);
  });

  it("is green when every command is", async () => {
    const outcome = await check(new ScriptedRunner([]), {
      default: ["sf check", "sf verify"],
    }).check("acme/widgets");

    expect(outcome.ok).toBe(true);
  });

  it("hands back what the check said, verbatim, because it becomes the finding", async () => {
    const runner = new ScriptedRunner([
      {
        match: () => true,
        result: { ok: false, exitCode: 1, stdout: "L4.PLAN_DECLARES_EXIT_CONDITION" },
      },
    ]);

    const outcome = await check(runner, { default: ["sf check"] }).check("acme/widgets");

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("L4.PLAN_DECLARES_EXIT_CONDITION");
  });

  it("stops at the first failure, so the agent gets one thing to fix", async () => {
    const runner = new ScriptedRunner([
      { match: (_c, args) => args.includes("sf check"), result: { ok: false, exitCode: 1 } },
    ]);

    await check(runner, { default: ["sf check", "sf verify"] }).check("acme/widgets");

    expect(runner.callsTo("sh")).toHaveLength(1);
  });

  it("refuses a repository nothing is configured to check, rather than waving it through", async () => {
    const outcome = await check(new ScriptedRunner([]), {}).check("acme/widgets");

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no check is configured for acme/widgets");
  });
});
