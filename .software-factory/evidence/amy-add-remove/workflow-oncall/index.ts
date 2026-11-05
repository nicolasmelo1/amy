// A workflow package that lives outside amy's repository, in the shape
// somebody else would ship one: a `workflow.mmd` beside it that says where a
// page can go, a `decide` that says where it goes next, and `actions` for
// what happens in the world. `amy add` has to mount it, name a profile for
// it, and let the engine drive it — without amy ever having heard of it.
import fs from "node:fs";
import path from "node:path";
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "oncall",
  pluginName: "@acme/workflow-oncall",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  decide: {
    paged: () => ({ kind: "advance", to: "acknowledged", effects: [], why: "the page was picked up" }),
    acknowledged: () => ({ kind: "settled", why: "the page was handled" }),
  },
  // A page is a file somebody dropped in a directory, which is all this needs.
  discover: async ({ ctx }) => {
    const pages = path.join(ctx.paths.state, "pages");
    return fs.existsSync(pages) ? fs.readdirSync(pages).map((file) => path.parse(file).name) : [];
  },
  observe: async () => ({}),
  actions: {},
});
