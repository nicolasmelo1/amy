import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  ...BRANCH_SETTINGS,
  checkouts: {
    type: "record",
    description:
      "where one repository's checkout is, instead of under the workspace root, which is where the gate's commands run",
    default: {},
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
} satisfies ConfigSchema;
