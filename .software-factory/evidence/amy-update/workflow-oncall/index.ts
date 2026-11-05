// One published version of the on-call workflow, a workflow from outside the
// repository: a `workflow.mmd` beside it and one `defineWorkflow` call. The
// version is whatever the package.json beside the built copy says, so one
// source is every version the stand-in registry holds.
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { defineWorkflow } from "@amykit/core";

const manifest: { version: string } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const version = manifest.version;

export const plugin = defineWorkflow({
  name: "oncall",
  pluginName: "@acme/workflow-oncall",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  decide: {
    paged: () => (appendFileSync(process.env.HOME + "/.amy/lifecycle.log", "workflow\n"), { kind: "advance", to: "acknowledged", effects: [], why: `the page was picked up at ${version}` }),
    acknowledged: () => ({ kind: "settled", why: "the page was handled" }),
  },
  discover: async ({ ctx }) => {
    const pages = ctx.paths.state + "/pages";
    return existsSync(pages) ? readdirSync(pages).map((f) => f.replace(/\.md$/, "")) : [];
  },
  observe: async () => ({}),
  actions: {},
});
