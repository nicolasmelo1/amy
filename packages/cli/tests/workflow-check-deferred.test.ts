import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { checkWorkflow } from "../src/workflow.js";

/** The core, by file: the module is written to a directory with no packages. */
const CORE = pathToFileURL(path.resolve(import.meta.dirname, "..", "..", "core", "dist", "index.js")).href;

/**
 * A workflow whose runtime is deferred and reads another deferred
 * contribution while it builds: its `actions` are built from the scope, and
 * read the helper its `extend` contributes.
 */
function workflowModule(helper: string): string {
  return `import { defineWorkflow, settled, advance } from ${JSON.stringify(CORE)};
const deferred = (build) => ({ [Symbol.for("amykit.deferred")]: build });
export const plugin = defineWorkflow({
  name: "oncall",
  pluginName: "workflow-oncall",
  configSchema: {}, policy: {}, needs: {},
  record: () => ({}),
  decide: { received: () => advance("done", "the work was received"), done: () => settled("done") },
  observe: async () => ({}),
  extend(registry, ctx) {
    registry.contribute("helpers", "clock", ${helper});
  },
  actions: ({ ctx }) => {
    ctx.contributions("helpers").get("clock").at();
    return {};
  },
});
`;
}

const DIAGRAM = "stateDiagram-v2\n    [*] --> received\n    received --> done\n    done --> [*]\n";

describe("checking a workflow whose runtime is deferred", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-workflow-deferred-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  function check(helper: string): Promise<string[]> {
    const entry = path.join(home, "oncall.ts");
    fs.writeFileSync(entry, workflowModule(helper), "utf-8");
    fs.writeFileSync(path.join(home, "workflow.mmd"), DIAGRAM, "utf-8");
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
