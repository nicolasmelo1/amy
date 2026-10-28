import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { checkWorkflow } from "../src/workflow.js";

/**
 * A workflow whose runtime is deferred and reads another deferred
 * contribution while it builds. `deferred` is spelled out by its global
 * marker, because the module is written to a directory with no packages.
 */
function workflowModule(helper: string): string {
  return `const deferred = (build) => ({ [Symbol.for("amykit.deferred")]: build });
const workflow = {
  name: "oncall",
  states: ["received", "done"],
  waitingStates: [],
  initialState: "received",
  terminalStates: ["done"],
  plan: (record) => record.state === "received"
    ? { kind: "advance", to: "done", effects: [], why: "the work was received" }
    : { kind: "settled", why: "done" },
};
export const plugin = {
  name: "workflow-oncall",
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("helpers", "clock", ${helper});
    registry.contribute("workflow-runtime", "oncall", deferred(() => {
      const clock = ctx.contributions("helpers").get("clock");
      return {
        policy: {},
        found: async () => [],
        newRecord: (id) => ({ id, state: "received", updatedAt: clock.at(), attempts: {}, history: [] }),
        observe: async () => ({}),
        actions: {},
        apply: (record) => record,
      };
    }));
  },
};
`;
}

describe("checking a workflow whose runtime is deferred", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-workflow-deferred-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  function check(helper: string): Promise<string[]> {
    const entry = path.join(home, "oncall.ts");
    fs.writeFileSync(entry, workflowModule(helper), "utf-8");
    const config = { ...DEFAULT_CONFIG, workflows: { oncall: { workflow: "oncall", plugins: [] } } };
    return checkWorkflow(home, "oncall", config, () => entry);
  }

  it("builds a deferred helper the runtime reads, the way the mount does", async () => {
    await expect(check(`deferred(() => ({ at: () => "2026-01-01T00:00:00.000Z" }))`)).resolves.toEqual([]);
  });

  it("refuses a helper that reads the runtime it is built for, naming the circle", async () => {
    const circular = `deferred(() => { ctx.contributions("workflow-runtime").get("oncall"); return { at: () => "" }; })`;

    const problems = await check(circular);

    expect(problems.join("\n")).toContain("each need what the other builds");
  });
});
