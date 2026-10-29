import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  ...BRANCH_SETTINGS,
  commands: {
    type: "record",
    description:
      "the check commands per repository, with a `default` fallback. `sf check` is the whole quality bar in a repository that has one",
    default: { default: ["sf check"] },
  },
  timeoutMs: {
    type: "number",
    description: "how long one check may run before it is given up on",
    default: 10 * 60 * 1000,
  },
} satisfies ConfigSchema;
