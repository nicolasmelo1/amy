import { ConfigSchema } from "@amy/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description:
      "where the records are kept, relative to the state directory. One per workflow, so two profiles under one `.amy` do not read each other's work",
    default: "tickets",
  },
};
