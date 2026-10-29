import { definePlugin } from "@amykit/core";
import { CommandGate } from "./CommandGate.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-command-gate",
  configSchema,
  register(registry, ctx) {
    // The gate (and the agent it hands paths to) runs where the work runs:
    // with a worktree port mounted, that is the item's own tree.
    const { git } = ctx.checkouts();

    registry.port(
      "gate",
      new CommandGate(ctx.runner, git, {
        commands: ctx.config.commands as Record<string, string[]>,
        timeoutMs: ctx.config.timeoutMs,
      }),
    );
  },
});
