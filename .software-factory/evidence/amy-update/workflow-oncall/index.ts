// One published version of the on-call workflow. The version is whatever
// the package.json beside the built copy says, so one source is every
// version the stand-in registry holds.
import { appendFileSync, readFileSync } from "node:fs";
import type { Plugin, Workflow, WorkflowRuntime } from "@amykit/core";

const manifest: { version: string } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const version = manifest.version;
const workflow: Workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesObservers: [],
  plan: (record) =>
    record.state === "paged"
      ? (appendFileSync(process.env.HOME + "/.amy/lifecycle.log", "workflow\n"), { kind: "advance", to: "acknowledged", effects: [], why: `the page was picked up at ${version}` })
      : { kind: "settled", why: "the page was handled" },
};

export const plugin: Plugin = {
  name: "@acme/workflow-oncall",
  version,
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", {
      policy: {},
      found: async () => {
        const fs = await import("node:fs");
        const pages = ctx.paths.state + "/pages";
        return fs.existsSync(pages) ? fs.readdirSync(pages).map((f) => f.replace(/\.md$/, "")) : [];
      },
      newRecord: (id, now) => ({ id, state: "paged", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      observe: async () => ({}),
      actions: {},
      apply: (record) => record,
    } satisfies WorkflowRuntime);
  },
};
