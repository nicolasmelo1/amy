import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  repo: {
    type: "string",
    required: true,
    description: "the repository the table lives in, as owner/name",
  },
  table: {
    type: "string",
    description: "the table's path in that repository",
    default: "plans/next-steps.md",
  },
  rows: {
    type: "number",
    description: "how many rows from the top are work at once; the rest wait their turn",
    default: 1,
  },
  branchPrefix: {
    type: "string",
    description: "what a row's branch starts with, before its plan's slug",
    default: "plan/",
  },
  ...BRANCH_SETTINGS,
} satisfies ConfigSchema;
