import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  defaultBranch: {
    type: "string",
    description: "the branch new work is cut from, which is not always `main`",
    default: "main",
  },
  model: {
    type: "string",
    description: "passed to the CLI as --model, which is the flag it accepts",
    default: "",
  },
  models: {
    type: "string[]",
    description:
      "the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `claude:<model>`. Empty means a single agent using `model`",
    default: [],
  },
  reviewerHints: {
    type: "record",
    description: "guidance appended when answering a particular reviewer, by host login",
    default: {},
  },
  timeoutMs: {
    type: "number",
    description: "how long one agent call may run before it is given up on",
    default: 30 * 60 * 1000,
  },
};
