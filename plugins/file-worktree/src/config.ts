import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  root: {
    type: "string",
    description:
      "where the worktrees live, outside every repository. `~` is expanded. The default is beside the state directory, which keeps one install's trees together",
    default: "",
  },
  workflow: {
    type: "string",
    description:
      "the first path segment of every tree this mount creates, so two workflows under one install never share a tree",
    default: "",
  },
  recordsDirectory: {
    type: "string",
    description:
      "where this profile stores workflow records. The host derives it so phase-local worktrees consult the same records as the mounted file store",
    default: "",
  },
  ...BRANCH_SETTINGS,
  checkouts: {
    type: "record",
    description:
      "where one repository's standing checkout is, instead of under the workspace root. A repository named here is never looked for under `root` at all",
    default: {},
  },
  retentionDays: {
    type: "number",
    description:
      "how many days a terminal, clean tree stays before a prune may remove it. A dirty, failed or in-flight tree is never a prune's",
    default: 7,
  },
} satisfies ConfigSchema;