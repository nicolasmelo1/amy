// A work phase that declares the phases it does not have: the project's own
// declaration, one reason per absent phase, which is what the status shows.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "payroll-work",
  pluginName: "workflow-payroll-work",
  states: ["OPENED"],
  terminal: ["OPENED"],
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  phases: {
    brief: "the ticket itself says what the work is, so no brief phase runs first",
    prove: "a person reads the pull request the work opens, so no proving phase runs at all",
  },
  decide: { OPENED: () => ({ kind: "settled", why: "the work opened what it does" }) },
});