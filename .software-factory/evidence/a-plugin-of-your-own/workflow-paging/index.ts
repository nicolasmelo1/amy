// A workflow installed from npm that imports a plugin by its name, the way
// workflows were written before they shipped only the ports they need. Which
// pager it reached is written beside its state on every discovery, so a
// profile that forked the pager can be seen to reach the fork.
import fs from "node:fs";
import path from "node:path";
import { defineWorkflow } from "@amykit/core";
import { said } from "@acme/plugin-pager";

export const plugin = defineWorkflow({
  name: "paging",
  pluginName: "@acme/workflow-paging",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  decide: {
    paged: () => ({ kind: "advance", to: "acknowledged", effects: [], why: "the page was picked up" }),
    acknowledged: () => ({ kind: "settled", why: "the page was handled" }),
  },
  discover: async ({ ctx }) => {
    fs.mkdirSync(ctx.paths.state, { recursive: true });
    fs.writeFileSync(path.join(ctx.paths.state, "pager-said.txt"), `${said}\n`, "utf-8");
    return [];
  },
  observe: async () => ({}),
  actions: {},
});
