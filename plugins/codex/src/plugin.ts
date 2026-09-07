import { Git, Plugin } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";
import { CodexHarness } from "./CodexHarness.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-codex",
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
      // Said out loud rather than left to the default: codex reports no cost
      // of its own, so the vendored table is the only way a run of it gets a
      // price, and it is the one harness a missing row makes a dollar
      // ceiling inert for.
      pricesItsOwnRuns: false,
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
