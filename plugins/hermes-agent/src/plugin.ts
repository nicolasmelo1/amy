import { definePlugin } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";
import { HermesHarness } from "./HermesHarness.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-hermes-agent",
  configSchema,
  register(registry, ctx) {
    const tiers = ctx.config.models;

    contributeTiers(registry, {
      harness: "hermes",
      // Hermes writes its own account: `cost_status: "included"` for a run a
      // subscription or a local model covered, where zero is the right
      // answer rather than a missing one, and `estimated_cost_usd` for the
      // providers it prices itself. Neither needs a row here, and a local
      // model would never have one.
      pricesItsOwnRuns: true,
      models: tiers.length > 0 ? tiers : [(ctx.config.model) || ""],
      make: (model) =>
        new HermesHarness(ctx.runner, {
          model: model || undefined,
          timeoutMs: ctx.config.timeoutMs,
        }),
    });
  },
});
