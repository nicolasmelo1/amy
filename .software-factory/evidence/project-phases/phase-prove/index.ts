// A proving phase as somebody writes one: it takes the criteria the brief
// settled as its input, refuses the first round it runs (what it is asked
// to show does not hold yet) and holds the second.
import { defineWorkflow } from "@amykit/core";

let drove = 0;

export const plugin = defineWorkflow({
  name: "invoices-prove",
  pluginName: "workflow-invoices-prove",
  states: ["CHECKED", "refused", "SATISFIED"],
  terminal: ["refused", "SATISFIED"],
  configSchema: {},
  policy: {},
  needs: {},
  input: { criteria: { type: "string[]", required: true, description: "what this proof must show" } },
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  output: { refused: () => ({ criteria: [], held: false }), SATISFIED: () => ({ criteria: [], held: true }) },
  decide: {
    CHECKED: () => {
      drove += 1;
      return { kind: "advance", to: drove === 1 ? "refused" : "SATISFIED", effects: [], why: drove === 1 ? "the criteria are not shown yet" : "every criterion holds" };
    },
    refused: () => ({ kind: "settled", why: "the proof refused; the walk carries it back" }),
    SATISFIED: () => ({ kind: "settled", why: "the proof holds" }),
  },
});