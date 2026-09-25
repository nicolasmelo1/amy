// A workflow package that lives outside amy's repository, in the shape
// somebody else would ship one: a `plan()` that says what happens next and a
// runtime that says how. `amy add` has to mount it, name a profile for it,
// and let the engine drive it — without amy ever having heard of it.
import fs from "node:fs";
import path from "node:path";

const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesObservers: [],
  plan: (record) =>
    record.state === "paged"
      ? { kind: "advance", to: "acknowledged", effects: [], why: "the page was picked up" }
      : { kind: "settled", why: "the page was handled" },
};

/** A page is a file somebody dropped in a directory, which is all this needs. */
const runtime = (pages) => ({
  policy: {},
  found: async () =>
    fs.existsSync(pages) ? fs.readdirSync(pages).map((file) => path.parse(file).name) : [],
  newRecord: (workId, now) => ({
    id: workId,
    state: "paged",
    updatedAt: now.toISOString(),
    attempts: {},
    history: [],
  }),
  observe: async () => ({}),
  actions: {},
  apply: (record) => record,
});

export const plugin = {
  name: "@acme/workflow-oncall",
  version: "1.0.0",
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", runtime(path.join(ctx.paths.state, "pages")));
  },
};