// A brief phase as a project writes one: it declares the section its brief
// answers and judges it, so the walk's GROOMED gate has a check to run.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "invoices-briefed-brief",
  pluginName: "workflow-invoices-briefed-brief",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  brief: { sections: ["Goal"], check: () => [] },
  output: { BRIEFED: () => ({ criteria: ["product", "interface"] }) },
  decide: { BRIEFED: () => ({ kind: "settled", why: "the brief is settled" }) },
});
