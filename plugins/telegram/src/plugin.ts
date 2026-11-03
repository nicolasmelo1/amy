import path from "node:path";
import { definePlugin } from "@amykit/core";
import { BotApi, TELEGRAM_API } from "./BotApi.js";
import { configSchema } from "./config.js";
import { TelegramConversation } from "./TelegramConversation.js";

export const TOKEN_VARIABLE = "TELEGRAM_BOT_TOKEN";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-telegram",
  configSchema,
  environment: [TOKEN_VARIABLE],
  register(registry, ctx) {
    const given = String(ctx.config.operator ?? "");
    // Refused at mount, naming the setting: a username where an id belongs is
    // a topic opened nowhere, found only by waiting for an answer.
    if (!/^\d+$/.test(given)) {
      throw new Error(`@amykit/plugin-telegram: \`operator\` must be your numeric Telegram user id, such as 123456789, got ${given}`);
    }
    // As Telegram spells it, so 004021 and 4021 are one operator and one state.
    const operator = String(Number(given));
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        `${TOKEN_VARIABLE} is not set. Create a bot with @BotFather, turn on its topics, and put its token in .env`,
      );
    }
    // What is kept belongs to one bot and one chat: switching either starts
    // afresh rather than reusing topics from another chat or an offset that
    // would confirm another bot's updates unread.
    const identity = `${token.split(":")[0]}-${operator}`;
    registry.port(
      "conversation",
      new TelegramConversation(new BotApi(token, { server: ctx.config.server ?? TELEGRAM_API }), {
        operator,
        // This profile's topics; a project's phase is handed its own directory.
        directory: path.join(ctx.paths.state, ctx.config.directory ?? "telegram", identity),
        // One reader of the bot's updates, whichever profile asks.
        shared: path.join(ctx.paths.state, "telegram-bot", identity),
      }),
    );
  },
});
