// A work phase that declares only its proving phase out: one reason, the
// reason a project without prove/ keeps, for the anchor carrying it.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "staff-work",
  pluginName: "workflow-staff-work",
  states: ["OPENED"],
  terminal: ["OPENED"],
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  phases: { prove: "a person reads the pull request the work opens, so no proving phase runs at all" },
  decide: { OPENED: () => ({ kind: "settled", why: "the work opened what it does" }) },
});