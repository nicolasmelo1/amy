import path from "node:path";
import { Plugin } from "@amykit/core";
import { CHANNEL_COLLECTION } from "@amykit/plugin-notify-fanout";
import { configSchema, inboxChannel } from "./inboxChannel.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-notify-inbox",
  configSchema,
  register(registry, ctx) {
    const directory = path.join(ctx.paths.state, ctx.config.directory as string);
    registry.contribute(CHANNEL_COLLECTION, "inbox", inboxChannel(directory, ctx.runner));
  },
};
