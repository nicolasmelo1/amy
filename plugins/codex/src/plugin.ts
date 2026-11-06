import { definePlugin } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";
import { CodexHarness } from "./CodexHarness.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-codex",
  configSchema,
  async register(registry, ctx) {
    const version = await ctx.runner.run("codex", ["--version"]);
    const reported = version.stdout.trim() || version.stderr.trim() || "unknown";
    if (!version.ok || !isCompatibleVersion(reported)) {
      throw new Error(
        `codex app-server protocol ${reported} is incompatible; expected codex-cli 0.166.x`,
      );
    }
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

function isCompatibleVersion(reported: string): boolean {
  return /^codex-cli 0\.166\.\d+(?:\s|$)/.test(reported);
}
