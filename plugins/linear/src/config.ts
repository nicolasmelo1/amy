import { ConfigSchema } from "@amy/core";
import { LINEAR_ENDPOINT } from "./LinearTracker.js";

/**
 * What this plugin needs told to it, and nothing more.
 *
 * `workingStatusName` is matched against the status *name*, never its
 * category: the tracker files In Review, In QA and Ready To Release under the
 * same category as In Progress.
 */
export const configSchema: ConfigSchema = {
  workingStatusName: {
    type: "string",
    required: true,
    description: "the exact status name a ticket must be in to be picked up",
  },
  repoByTeam: {
    type: "record",
    description: "which repository a team's tickets land in, by team key",
    default: {},
  },
  defaultRepo: {
    type: "string",
    description: "the repository used for a team that is not in repoByTeam",
    default: "",
  },
  endpoint: {
    type: "string",
    description:
      "the GraphQL endpoint to talk to. Linear's own by default, and the one thing that has to move for a stand-in tracker to take its place in an end-to-end run",
    default: LINEAR_ENDPOINT,
  },
};
