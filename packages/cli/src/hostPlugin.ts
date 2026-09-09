import { Plugin } from "@amykit/core";
import type { Roster } from "./config.js";

/**
 * The host's own glue, mounted like anything else.
 *
 * Today's roster is neither a port nor a setting: it is data that changes
 * daily and lives in its own file, and reading it is something the host knows
 * how to do. It is contributed under the workflow-data collection's roster
 * name — the name the ticket workflow reads, spelled here rather than
 * imported from it, so the command carries no workflow package — and read
 * when a tick needs it, so confirming the roster takes effect without a
 * restart.
 */
const WORKFLOW_DATA = "workflow-data";

export function hostPlugin(readRoster: () => Roster): Plugin {
  return {
    name: "@amykit/cli",
    version: "0.1.0",
    register(registry) {
      registry.contribute(WORKFLOW_DATA, "roster", { read: readRoster });
    },
  };
}