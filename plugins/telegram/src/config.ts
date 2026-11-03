import { ConfigSchema } from "@amykit/core";
import { TELEGRAM_API } from "./BotApi.js";

/** What this plugin needs told to it, and nothing more. The token is read from the environment. */
export const configSchema = {
  operator: {
    type: "string",
    required: true,
    description: "your Telegram user id, a number such as 123456789: the private chat each work item's topic opens in, and the only person whose replies are answers",
    example: "123456789",
  },
  server: {
    type: "string",
    description: "the Bot API server, for a local one instead of Telegram's",
    default: TELEGRAM_API,
  },
  directory: {
    type: "string",
    description: "where this profile's topics are remembered, by work id, relative to the state directory; the replies read for every profile are kept once per bot",
    default: "telegram",
  },
} satisfies ConfigSchema;
