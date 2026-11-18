// A workflow that finds one ticket the moment it looks, and settles it.
//
// It exists for one assertion: `amy run` used to tick a queue it never
// discovered into, so a ticket sitting in the world was never picked up.
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "finds-a-ticket",
  pluginName: "@acme/workflow-finds-a-ticket",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  decide: {
    queued: () => ({ kind: "advance", to: "done", effects: [], why: "the ticket was found" }),
    done: () => ({ kind: "settled", why: "there was one ticket and it is settled" }),
  },
  discover: async () => ["TICKET-1"],
  observe: async () => ({}),
  actions: {},
});
