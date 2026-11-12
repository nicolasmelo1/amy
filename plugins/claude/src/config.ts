import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
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
  permissionMode: {
    type: "string",
    description:
      "passed to the CLI as --permission-mode on a run that may write: `acceptEdits`, `auto` or `bypassPermissions`. A read-only run is always `plan`",
    default: "acceptEdits",
  },
  timeoutMs: {
    type: "number",
    description: "how long one agent call may run before it is given up on",
    default: 30 * 60 * 1000,
  },
} satisfies ConfigSchema;
