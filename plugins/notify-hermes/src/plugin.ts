import { Plugin } from "@amykit/core";
import { CHANNEL_COLLECTION } from "@amykit/plugin-notify-fanout";
import { configSchema, hermesChannel, hermesTargetIsKnown } from "./hermesChannel.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-notify-hermes",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const target = ctx.config.target as string;

    registry.contribute(CHANNEL_COLLECTION, "hermes", hermesChannel(ctx.runner, target));

    // The port's own knowledge, asked rather than re-derived: whether a
    // delivery target is reachable is something only this plugin knows, and
    // the host asking would mean the host importing one notifier's reader —
    // the dependency this plugin exists to keep out of the command.
    registry.port("notify", {
      async isReachable(asked: string) {
        if (asked !== target) return false;

        const result = await ctx.runner.run(
          "hermes",
          ["send", "--list", "--json"],
          { timeoutMs: 60_000 },
        );
        if (!result.ok) {
          throw new Error(result.stderr.split("\n")[0] || "hermes send --list failed");
        }

        return hermesTargetIsKnown(JSON.parse(result.stdout), asked);
      },
    });
  },
};
