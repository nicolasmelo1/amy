import { Git, definePlugin, Worktree } from "@amykit/core";
import { CommandGate } from "./CommandGate.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-command-gate",
  configSchema,
  register(registry, ctx) {
    const git = new Git(
      ctx.runner,
      {
        workspaceRoot: ctx.paths.workspace,
        checkouts: ctx.paths.checkouts,
        defaultBranch: ctx.config.defaultBranch,
        baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
      },
      // The gate (and the agent it hands paths to) runs where the work runs:
      // with a worktree port mounted, that is the item's own tree.
      ctx.port("worktree") as Worktree | undefined,
    );

    registry.port(
      "gate",
      new CommandGate(ctx.runner, git, {
        commands: ctx.config.commands as Record<string, string[]>,
        timeoutMs: ctx.config.timeoutMs,
      }),
    );
  },
});
