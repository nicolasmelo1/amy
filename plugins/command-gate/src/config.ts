import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  defaultBranch: {
    type: "string",
    description: "the branch new work is cut from, which is not always `main`",
    default: "main",
  },
  commands: {
    type: "record",
    required: true,
    description: "the check commands per repository, with a `default` fallback",
  },
  timeoutMs: {
    type: "number",
    description: "how long one check may run before it is given up on",
    default: 30 * 60 * 1000,
  },
};
