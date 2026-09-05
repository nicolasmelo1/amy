import { Plugin } from "@amykit/core";
import { Roster, WORKFLOW_DATA } from "@amykit/workflow-ticket-to-qa";

/**
 * The host's own glue, mounted like anything else.
 *
 * Today's roster is neither a port nor a setting: it is data that changes
 * daily and lives in its own file, and reading it is something the host knows
 * how to do. It is contributed, and read when a tick needs it, so confirming
 * the roster takes effect without a restart.
 */
export function hostPlugin(readRoster: () => Roster): Plugin {
  return {
    name: "@amykit/cli",
    version: "0.1.0",
    register(registry) {
      registry.contribute(WORKFLOW_DATA, "roster", { read: readRoster });
    },
  };
}
