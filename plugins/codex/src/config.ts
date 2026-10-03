import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  model: {
    type: "string",
    description: "passed to the CLI as --model. Empty leaves the choice to codex",
    default: "",
  },
  models: {
    type: "string[]",
    description:
      "the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `codex:<model>`. Empty means a single agent named `codex`",
    default: [],
  },
  timeoutMs: {
    type: "number",
    description: "how long one agent call may run before it is given up on",
    default: 30 * 60 * 1000,
  },
};
