import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  model: {
    type: "string",
    description: "passed to the CLI as --model. Empty leaves the choice to hermes",
    default: "",
  },
  models: {
    type: "string[]",
    description:
      "the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `hermes:<model>`. Empty means a single agent named `hermes`",
    default: [],
  },
  profile: {
    type: "string",
    description:
      "the Hermes profile amy's runs use, so they read and write nothing of the operator's own Hermes. `amy init` creates it from the active profile when it is missing",
    default: "amy",
  },
  timeoutMs: {
    type: "number",
    description: "how long one agent call may run before it is given up on",
    default: 30 * 60 * 1000,
  },
} satisfies ConfigSchema;
