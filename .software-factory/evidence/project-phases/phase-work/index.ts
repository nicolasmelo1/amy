// A work phase as somebody writes one: a `defineWorkflow` declaration whose
// single state ends the work it opened.
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
  decide: { OPENED: () => ({ kind: "settled", why: "the work opened what it does" }) },
});