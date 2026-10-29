import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  // Only the map: a repository it names has its pull requests opened against
  // that branch, and every other against the forge's own default for it.
  baseBranch: BRANCH_SETTINGS.baseBranch,
} satisfies ConfigSchema;