import path from "node:path";
import { Plugin } from "@amykit/core";
import { configSchema } from "./config.js";
import { resolveToken } from "./secret.js";
import { SlackApi } from "./SlackApi.js";
import { SlackConversation } from "./SlackConversation.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-slack",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const channel = ctx.config.channel as string;
    const operator = ctx.config.operator as string;
    // Refused at mount, naming the setting: a name where an id belongs is a
    // thread posted nowhere, found only by waiting for an answer.
    if (!/^[CG][A-Z0-9]+$/.test(channel)) {
      throw new Error(`@amykit/plugin-slack: \`channel\` must be a channel id such as C0XXXXXXX, got ${channel}`);
    }
    if (!/^[UW][A-Z0-9]+$/.test(operator)) {
      throw new Error(`@amykit/plugin-slack: \`operator\` must be a user id such as U0XXXXXXX, got ${operator}`);
    }

    const api = new SlackApi(resolveToken(ctx.config.token as string));
    registry.port(
      "conversation",
      new SlackConversation(api, { channel, operator, directory: path.join(ctx.paths.state, "slack") }),
    );
  },
};
