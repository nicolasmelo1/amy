import { definePlugin } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";
import { CodexHarness } from "./CodexHarness.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-codex",
  configSchema,
  register(registry, ctx) {
    const tiers = ctx.config.models;

    contributeTiers(registry, {
      harness: "codex",
      // Said out loud rather than left to the default: codex reports no cost
      // of its own, so the vendored table is the only way a run of it gets a
      // price, and it is the one harness a missing row makes a dollar
      // ceiling inert for.
      pricesItsOwnRuns: false,
      models: tiers.length > 0 ? tiers : [(ctx.config.model) || ""],
      make: (model) =>
        new CodexHarness(ctx.runner, {
          model: model || undefined,
          timeoutMs: ctx.config.timeoutMs,
        }),
    });
  },
});
