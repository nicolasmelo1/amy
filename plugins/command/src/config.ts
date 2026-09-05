import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  allow: {
    type: "record",
    required: true,
    description:
      "the commands a workflow may run, by name. The name is what a workflow asks for; the value is the command line it stands for, and this is the only place one is written",
  },
  cwd: {
    type: "string",
    description: "where a command runs when it does not say, defaulting to the state directory",
    default: "",
  },
  timeoutMs: {
    type: "number",
    description: "how long one command may run before it is given up on",
    default: 5 * 60 * 1000,
  },
};
