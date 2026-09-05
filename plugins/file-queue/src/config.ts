import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description:
      "where the queue is kept, relative to the state directory. One per workflow, so two profiles under one `.amy` do not claim each other's work",
    default: "queue",
  },
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
