import { ConfigSchema } from "@amy/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description: "where the tasks are kept, relative to the state directory",
    default: "tasks",
  },
  repo: {
    type: "string",
    description: "what a task is about when it does not say",
    default: "",
  },
};
