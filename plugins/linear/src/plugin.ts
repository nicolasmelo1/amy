import { Plugin } from "@amy/core";
import { CHANNEL_COLLECTION } from "@amy/plugin-notify-fanout";
import { LinearTracker } from "./LinearTracker.js";
import { HttpGraphQLClient } from "./HttpGraphQLClient.js";
import { trackerChannel } from "./ticketChannel.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amy/plugin-linear",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const key = process.env.LINEAR_API_KEY;
    if (!key) {
      // Thrown rather than swallowed: mount turns it into a problem naming
      // this plugin, which is more useful than a tracker that answers
      // nothing.
      throw new Error(
        "LINEAR_API_KEY is not set. Create a personal API key in Linear under " +
          "Settings, Security and access, and put it in .env",
      );
    }

    const tracker = new LinearTracker(new HttpGraphQLClient(ctx.config.endpoint as string, key), {
      workingStatusName: ctx.config.workingStatusName as string,
      repoByTeam: ctx.config.repoByTeam as Record<string, string>,
      defaultRepo: ctx.config.defaultRepo as string,
    });

    registry.port("tracker", tracker);
    // The channel that comments on a ticket belongs with whatever owns the
    // ticket, which is this.
    registry.contribute(CHANNEL_COLLECTION, "tracker", trackerChannel(tracker));
  },
};
