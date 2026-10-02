import { ConfigSchema } from "@amykit/core";
import { DEFAULT_RATE_LIMIT_RETRIES, DEFAULT_RETRY_AFTER_S } from "./SlackApi.js";
import { DEFAULT_RETENTION_DAYS } from "./SlackConversation.js";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  channel: {
    type: "string",
    required: true,
    description: "the channel id every work thread opens in, such as C0XXXXXXX — an id, not a name",
    example: "C0XXXXXXX",
  },
  token: {
    type: "string",
    required: true,
    description: "where the bot token lives: `env:SLACK_BOT_TOKEN` or `file:<path>#<KEY>`, never the token itself",
    example: "env:SLACK_BOT_TOKEN",
  },
  operator: {
    type: "string",
    required: true,
    description: "the user id, such as U0XXXXXXX, whose replies are answers; everybody else's are ignored",
    example: "U0XXXXXXX",
  },
  maxRateLimitRetries: {
    type: "number",
    description: "how many times a call Slack rate limits (HTTP 429) is waited out and tried again before it fails",
    default: DEFAULT_RATE_LIMIT_RETRIES,
  },
  defaultRetryAfterSeconds: {
    type: "number",
    description: "how long to wait after a 429 that carries no Retry-After; one names its own wait, and that wins",
    default: DEFAULT_RETRY_AFTER_S,
  },
  directory: {
    type: "string",
    description: "where each work item's thread is remembered, relative to the state directory",
    default: "slack",
  },
  retentionDays: {
    type: "number",
    description:
      "days a downloaded file or a thread's memory stays unused before it is pruned, 0 to keep everything. A pruned file is fetched again when its reply is read; a pruned thread means the next question opens a new one",
    default: DEFAULT_RETENTION_DAYS,
  },
};
