import { Git, Plugin } from "@amy/core";
import { contributeTiers } from "@amy/agent-kit";
import { ClaudeHarness } from "./ClaudeHarness.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amy/plugin-claude",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const git = new Git(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      defaultBranch: ctx.config.defaultBranch as string,
    });

    const tiers = ctx.config.models as string[];

    // Contributed rather than mounted as the `agent` port: only one plugin
    // can own a port, and three harnesses that each wanted to be *the* agent
    // would refuse to mount together. The relay composes what is contributed.
    contributeTiers(registry, {
      harness: "claude",
      models: tiers.length > 0 ? tiers : [(ctx.config.model as string) || ""],
      git,
      agent: { reviewerHints: ctx.config.reviewerHints as Record<string, string> },
      make: (model) =>
        new ClaudeHarness(ctx.runner, {
          model: model || undefined,
          timeoutMs: ctx.config.timeoutMs as number,
        }),
    });
  },
};
