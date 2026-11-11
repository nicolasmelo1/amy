// The proving phase again, as a package that resolves a core of its own — a
// phase folder with its own node_modules — and asks for a port the way every
// shipped workflow does. The CLI mounting it holds another copy of the core.
import { defineWorkflow, optional, WorkRecord } from "@amykit/core";

let drove = 0;

export const plugin = defineWorkflow({
  name: "invoices-prove",
  pluginName: "workflow-invoices-prove",
  configSchema: {},
  policy: {},
  needs: { brief: optional<object>() },
  input: { criteria: { type: "string[]", required: true, description: "what this proof must show" } },
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  output: {
    refused: () => ({ criteria: [], held: false }),
    SATISFIED: (record: WorkRecord) => ({ criteria: record.input?.criteria, held: true }),
  },
  decide: {
    CHECKED: () => {
      drove += 1;
      return { kind: "advance", to: drove === 1 ? "refused" : "SATISFIED", effects: [], why: drove === 1 ? "the criteria are not shown yet" : "every criterion holds" };
    },
    refused: () => ({ kind: "settled", why: "the proof refused; the walk carries it back" }),
    SATISFIED: () => ({ kind: "settled", why: "the proof holds" }),
  },
});