// A workflow package that lives outside amy's repository.
//
// It is an on-call week the way somebody would write one on their own
// machine: a `workflow.mmd` beside it that says where a page can go, a
// `decide` that says where it goes next, and `actions` for what happens in
// the world — none, here. No package here imports it and no name in amy
// mentions it. If amy drives this, amy drives anything shaped like it.
import fs from "node:fs";
import path from "node:path";
import { defineWorkflow } from "@amykit/core";

export const plugin = defineWorkflow({
  name: "oncall",
  pluginName: "@acme/workflow-oncall",
  configSchema: {},
  policy: {},
  needs: {},
  // What it prepares, so `init --install` is seen to prepare a package it
  // installed in the same invocation, not only one that was already there.
  files: [{ path: "rota.yaml", content: "# who is on call\n" }],
  setup: [
    {
      name: "pager",
      run: ({ state }) => {
        fs.writeFileSync(path.join(state, "pager-ready"), "");
        return { label: "pager", ok: true };
      },
    },
  ],
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
