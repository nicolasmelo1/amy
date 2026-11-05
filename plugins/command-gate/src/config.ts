import { BRANCH_SETTINGS, ConfigSchema } from "@amykit/core";

/**
 * What this plugin needs told to it, and nothing more.
 *
 * The gate is the machine's last word before a pull request, and it was the
 * machine's own top-level key; it moved here. The checkouts and branches the
 * commands run in are the workspace's answer now, so none are named here.
 */
export const configSchema = {
  ...BRANCH_SETTINGS,
  gate: {
    type: "record",
    description: "the deterministic gate commands per repository, with a `default` fallback; a repository with no entry and no `default` is refused rather than waved through",
    default: {},
  },
  timeoutMs: {
    type: "number",
    description: "how long one check may run before it is given up on",
    default: 30 * 60 * 1000,
  },
} satisfies ConfigSchema;
