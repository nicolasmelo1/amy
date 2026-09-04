import { ConfigSchema } from "@amy/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "every repository review load is counted across",
  },
  qaStatusName: {
    type: "string",
    required: true,
    description: "the status a ticket moves to when it is handed to QA",
  },
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
  policy: {
    type: "record",
    description:
      "the workflow's policy: maxImplementAttempts, maxGateAttempts, pollBackoffMs, rosterBackoffMs and maxOpenReviewsPerReviewer. Anything left out keeps its default",
    default: {},
  },
  maxItemAttempts: {
    type: "number",
    description: "how many times one ticket may fail before the operator is told",
    default: 5,
  },
};
