import { Git, Plugin } from "@amy/core";
import { contributeTiers } from "@amy/agent-kit";
import { CodexHarness } from "./CodexHarness.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amy/plugin-codex",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const git = new Git(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      defaultBranch: ctx.config.defaultBranch as string,
    });

    const tiers = ctx.config.models as string[];

    contributeTiers(registry, {
      harness: "codex",
      models: tiers.length > 0 ? tiers : [(ctx.config.model as string) || ""],
      git,
      agent: { reviewerHints: ctx.config.reviewerHints as Record<string, string> },
      make: (model) =>
        new CodexHarness(ctx.runner, {
          model: model || undefined,
          timeoutMs: ctx.config.timeoutMs as number,
        }),
    });
  },
};
