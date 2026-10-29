import path from "node:path";
import { definePlugin } from "@amykit/core";
import { configSchema } from "./config.js";
import { resolveToken } from "./secret.js";
import { DEFAULT_RATE_LIMIT_RETRIES, DEFAULT_RETRY_AFTER_S, SlackApi } from "./SlackApi.js";
import { DEFAULT_MARKS, DEFAULT_RETENTION_DAYS, SlackConversation } from "./SlackConversation.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-slack",
  configSchema,
  register(registry, ctx) {
    const channel = ctx.config.channel;
    const operator = ctx.config.operator;
    // Refused at mount, naming the setting: a name where an id belongs is a
    // thread posted nowhere, found only by waiting for an answer.
    if (!/^[CG][A-Z0-9]+$/.test(channel)) {
      throw new Error(`@amykit/plugin-slack: \`channel\` must be a channel id such as C0XXXXXXX, got ${channel}`);
    }
    if (!/^[UW][A-Z0-9]+$/.test(operator)) {
      throw new Error(`@amykit/plugin-slack: \`operator\` must be a user id such as U0XXXXXXX, got ${operator}`);
    }

    // The host applies the schema's defaults; a caller that did not still mounts the same thing.
    const retries = (ctx.config.maxRateLimitRetries) ?? DEFAULT_RATE_LIMIT_RETRIES;
    const fallback = (ctx.config.defaultRetryAfterSeconds) ?? DEFAULT_RETRY_AFTER_S;
    const retentionDays = (ctx.config.retentionDays) ?? DEFAULT_RETENTION_DAYS;
    for (const [name, value] of Object.entries({ maxRateLimitRetries: retries, defaultRetryAfterSeconds: fallback, retentionDays })) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`@amykit/plugin-slack: \`${name}\` must be zero or more, got ${value}`);
      }
    }

    const api = new SlackApi(resolveToken(ctx.config.token), {
      maxRateLimitRetries: Math.floor(retries),
      defaultRetryAfterSeconds: fallback,
    });
    registry.port(
      "conversation",
      new SlackConversation(api, {
        channel,
        operator,
        directory: path.join(ctx.paths.state, (ctx.config.directory) ?? "slack"),
        retentionDays,
        marks: {
          decision: (ctx.config.decisionReaction) ?? DEFAULT_MARKS.decision,
          discussion: (ctx.config.discussionReaction) ?? DEFAULT_MARKS.discussion,
        },
        now: ctx.now,
      }),
    );
  },
});
