import { Git, Plugin } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";
import { HermesHarness } from "./HermesHarness.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-hermes-agent",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const git = new Git(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      defaultBranch: ctx.config.defaultBranch as string,
    });

    const tiers = ctx.config.models as string[];

    contributeTiers(registry, {
      harness: "hermes",
      // Hermes writes its own account: `cost_status: "included"` for a run a
      // subscription or a local model covered, where zero is the right
      // answer rather than a missing one, and `estimated_cost_usd` for the
      // providers it prices itself. Neither needs a row here, and a local
      // model would never have one.
      pricesItsOwnRuns: true,
      models: tiers.length > 0 ? tiers : [(ctx.config.model as string) || ""],
      git,
      agent: { reviewerHints: ctx.config.reviewerHints as Record<string, string> },
      make: (model) =>
        new HermesHarness(ctx.runner, {
          model: model || undefined,
          timeoutMs: ctx.config.timeoutMs as number,
        }),
    });
  },
};
