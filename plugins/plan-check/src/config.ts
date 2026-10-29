import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  defaultBranch: {
    type: "string",
    description: "the branch a plan branch is cut from, which is not always `main`",
    default: "main",
  },
  baseBranch: {
    type: "record",
    description: "the configured base branch by repository, overriding the fallback branch",
  },
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
