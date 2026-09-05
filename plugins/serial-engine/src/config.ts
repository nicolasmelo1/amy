import { ConfigSchema } from "@amykit/core";

/**
 * What this plugin needs told to it, and nothing more.
 *
 * `repos`, `qaStatusName` and `policy` used to be here. They are the
 * workflow's vocabulary, not an engine's, and they moved to the workflow's
 * own slice when the engine stopped knowing what a ticket is.
 */
export const configSchema: ConfigSchema = {
  staleClaimMs: {
    type: "number",
    description: "how long a claimed item may sit before it counts as abandoned",
    default: 30 * 60 * 1000,
  },
  retentionDays: {
    type: "number",
    description: "how long a finished queue item is kept before it is pruned",
    default: 7,
  },
  maxItemAttempts: {
    type: "number",
    description: "how many times one item may fail before the operator is told and it is dropped",
    default: 5,
  },
  retryDelayMs: {
    type: "number",
    description: "how long a failed item is held before it is looked at again",
    default: 5 * 60 * 1000,
  },
};
