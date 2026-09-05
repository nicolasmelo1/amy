import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description: "where the notes are watched for, relative to the state directory",
    default: "notes",
  },
  repo: {
    type: "string",
    default: "",
    description:
      "the repository a note is about when it does not say, which is also the one this machine's own failures are filed against",
  },
  writeFailureNotes: {
    type: "boolean",
    description:
      "whether a tick this machine gave up on leaves a note behind, so the thing that broke becomes the thing that gets fixed",
    default: true,
  },
};
