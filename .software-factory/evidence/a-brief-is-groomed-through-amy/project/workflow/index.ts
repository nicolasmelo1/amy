// The work phase the brief is for: a walk that settles once it is looked at.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "invoices-work",
  pluginName: "workflow-invoices-work",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  decide: { OPENED: () => ({ kind: "settled", why: "the work is opened" }) },
});
