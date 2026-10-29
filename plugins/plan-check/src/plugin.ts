import { definePlugin } from "@amykit/core";
import { PlanCommandCheck } from "./PlanCommandCheck.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-plan-check",
  configSchema,
  register(registry, ctx) {
    // The gate (and the agent it hands paths to) runs where the work runs:
    // with a worktree port mounted, that is the item's own tree.
    const { git } = ctx.checkouts();

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
        timeoutMs: ctx.config.timeoutMs,
      }),
    );
  },
});
