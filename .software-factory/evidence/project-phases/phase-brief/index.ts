// A brief phase as somebody writes one: a `defineWorkflow` declaration whose
// walk settles the moment it is looked at, returning the criteria the brief
// settled.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "invoices-brief",
  pluginName: "workflow-invoices-brief",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  output: { BRIEFED: () => ({ criteria: ["product", "interface"] }) },
  decide: { BRIEFED: () => ({ kind: "settled", why: "the brief is settled" }) },
});