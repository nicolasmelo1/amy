import { definePlugin } from "@amykit/core";
import { contributeTiers, contributeUsage } from "@amykit/agent-kit";
import { ClaudeHarness, writingMode } from "./ClaudeHarness.js";
import { configSchema } from "./config.js";
import { ClaudeUsageReader } from "./usage.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-claude",
  configSchema,
  register(registry, ctx) {
    const tiers = ctx.config.models;
    // Refused here, at mount, rather than as a run that answers and edits nothing.
    const permissionMode = writingMode(ctx.config.permissionMode);

    // Contributed rather than mounted as the `agent` port: only one plugin
    // can own a port, and three harnesses that each wanted to be *the* agent
    // would refuse to mount together. The relay composes what is contributed.
    contributeTiers(registry, {
      harness: "claude",
      // The envelope carries `total_cost_usd`, and a cost the harness
      // reported beats anything a table could work out, so a missing row
      // never leaves a ceiling in money with nothing to spend against it.
      pricesItsOwnRuns: true,
      models: tiers.length > 0 ? tiers : [(ctx.config.model) || ""],
      make: (model) =>
        new ClaudeHarness(ctx.runner, {
          model: model || undefined,
          permissionMode,
          timeoutMs: ctx.config.timeoutMs,
        }),
    });
    contributeUsage(registry, new ClaudeUsageReader(ctx.runner, { timeoutMs: ctx.config.timeoutMs }));
  },
});
