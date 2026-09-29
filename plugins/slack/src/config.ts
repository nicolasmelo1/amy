import { ConfigSchema } from "@amykit/core";

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
};
