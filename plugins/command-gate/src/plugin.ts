import { Git, Plugin, Worktree } from "@amykit/core";
import { CommandGate } from "./CommandGate.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-command-gate",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const git = new Git(
      ctx.runner,
      {
        workspaceRoot: ctx.paths.workspace,
        defaultBranch: ctx.config.defaultBranch as string,
      },
      // The gate (and the agent it hands paths to) runs where the work runs:
      // with a worktree port mounted, that is the item's own tree.
      ctx.port("worktree") as Worktree | undefined,
    );

    registry.port(
      "gate",
      new CommandGate(ctx.runner, git, {
        commands: ctx.config.commands as Record<string, string[]>,
        timeoutMs: ctx.config.timeoutMs as number,
      }),
    );
  },
};
