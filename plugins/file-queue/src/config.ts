import { ConfigSchema } from "@amy/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  retentionDays: {
    type: "number",
    description: "how long a finished queue item is kept before it is pruned",
    default: 7,
  },
  staleClaimMs: {
    type: "number",
    description: "how long a claimed item may sit before it counts as abandoned",
    default: 30 * 60 * 1000,
  },
};
