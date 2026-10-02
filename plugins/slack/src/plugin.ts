import path from "node:path";
import { Plugin } from "@amykit/core";
import { configSchema } from "./config.js";
import { resolveToken } from "./secret.js";
import { DEFAULT_RATE_LIMIT_RETRIES, DEFAULT_RETRY_AFTER_S, SlackApi } from "./SlackApi.js";
import { DEFAULT_RETENTION_DAYS, SlackConversation } from "./SlackConversation.js";

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

    // The host applies the schema's defaults; a caller that did not still mounts the same thing.
    const retries = (ctx.config.maxRateLimitRetries as number | undefined) ?? DEFAULT_RATE_LIMIT_RETRIES;
    const fallback = (ctx.config.defaultRetryAfterSeconds as number | undefined) ?? DEFAULT_RETRY_AFTER_S;
    const retentionDays = (ctx.config.retentionDays as number | undefined) ?? DEFAULT_RETENTION_DAYS;
    for (const [name, value] of Object.entries({ maxRateLimitRetries: retries, defaultRetryAfterSeconds: fallback, retentionDays })) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`@amykit/plugin-slack: \`${name}\` must be zero or more, got ${value}`);
      }
    }

    const api = new SlackApi(resolveToken(ctx.config.token as string), {
      maxRateLimitRetries: Math.floor(retries),
      defaultRetryAfterSeconds: fallback,
    });
    registry.port(
      "conversation",
      new SlackConversation(api, {
        channel,
        operator,
        directory: path.join(ctx.paths.state, (ctx.config.directory as string | undefined) ?? "slack"),
        retentionDays,
        now: ctx.now,
      }),
    );
  },
};
