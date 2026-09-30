import { ConfigSchema } from "@amykit/core";

/** What this store needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description: "where briefs are kept, relative to the host-selected artifact root",
    default: "briefs",
  },
};
