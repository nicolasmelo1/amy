// A phase directory as somebody writes one: an index exporting a workflow,
// named for the project's phase directory it was copied into.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, WorkflowRuntime } from "@amykit/core";

const name = path.basename(path.dirname(fileURLToPath(import.meta.url)));

export const plugin: Plugin = { name: `invoices-${name}`, version: "1.0.0", register(registry) {
    registry.workflow({
      name: `invoices-${name}`, states: ["START", "DONE"], waitingStates: [],
      initialState: "START", terminalStates: ["DONE"], usesObservers: [],
      plan: () => ({ kind: "settled", why: "scenario" }),
    });
    registry.contribute("workflow-runtime", `invoices-${name}`, {
      policy: {}, found: async () => [], observe: async () => ({}), actions: {},
      newRecord: (id, now) => ({ id, state: "START", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      apply: (record) => record,
    } satisfies WorkflowRuntime);
} };
