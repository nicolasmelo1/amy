import { Plugin } from "@amy/core";
import { CHANNEL_COLLECTION } from "@amy/plugin-notify-fanout";
import { configSchema, hermesChannel } from "./hermesChannel.js";

export const plugin: Plugin = {
  name: "@amy/plugin-notify-hermes",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.contribute(
      CHANNEL_COLLECTION,
      "hermes",
      hermesChannel(ctx.runner, ctx.config.target as string),
    );
  },
};
