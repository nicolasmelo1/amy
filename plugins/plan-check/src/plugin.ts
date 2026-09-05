import { Git, Plugin } from "@amykit/core";
import { PlanCommandCheck } from "./PlanCommandCheck.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-plan-check",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const git = new Git(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      defaultBranch: ctx.config.defaultBranch as string,
    });

    // The action and the port together, which is what the registry asks of a
    // plugin adding an action the core does not ship: an action nobody can
    // execute is a promise the machine cannot keep. `check-plan` is not in
    // the core catalogue because nothing has yet shown it is general — a
    // second workflow needing it is what would move it there.
    registry.action(
      "check-plan",
      { port: "plan-check", method: "check" },
      new PlanCommandCheck(ctx.runner, git, {
        commands: ctx.config.commands as Record<string, string[]>,
        timeoutMs: ctx.config.timeoutMs as number,
      }),
    );
  },
};
