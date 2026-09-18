import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  baseBranch: {
    type: "record",
    description:
      "where one repository's base branch is, instead of the forge's own default for it. A repository named here has its pull requests opened against that branch",
    default: {},
  },
};