import { ConfigSchema } from "@amykit/core";
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
  /**
   * Whether a notification is also commented on the ticket.
   *
   * Off, and the default is the decision. This plugin contributes a channel
   * to the fan-out, and the fan-out reaches every contributed channel with no
   * way to route one announcement — so "on" means every progress notice the
   * engine emits becomes a public comment. `TBO-1241 is failing in COPILOT_FIX
   * and I am retrying: git checkout ... Aborting` landed on a real ticket a
   * team reads, which is a machine talking about itself where people talk to
   * each other.
   *
   * Turning it off does not make amy quiet: a workflow that has a question
   * about a ticket calls `tracker.comment` directly, and the hermes and inbox
   * channels still carry everything else. Derived from `notify.tracker`, so
   * the file the operator edits is still the one place it is said.
   */
  announceOnTicket: {
    type: "boolean",
    description:
      "also comment every notification on the ticket. Off: the tracker is for questions and answers, and a progress notice is neither",
    default: false,
  },
  endpoint: {
    type: "string",
    description:
      "the GraphQL endpoint to talk to. Linear's own by default, and the one thing that has to move for a stand-in tracker to take its place in an end-to-end run",
    default: LINEAR_ENDPOINT,
  },
};
