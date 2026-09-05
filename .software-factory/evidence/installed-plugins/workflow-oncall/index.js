// A workflow package that lives outside amy's repository.
//
// It is an on-call week the way somebody would write one on their own
// machine: a `plan()` that says what happens next, a runtime that says how,
// and nothing else. No package here imports it and no name in amy mentions
// it. If amy drives this, amy drives anything shaped like it.
import fs from "node:fs";
import path from "node:path";

const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesActions: [],
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
  handlers: () => ({}),
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
