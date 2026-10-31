import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "pele";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { pluginsRootResolver } from "../src/loader.js";
import { exportWorkflow, writeWorkflow } from "../src/workflow.js";

const DRAWN = `stateDiagram-v2
    classDef waiting stroke-dasharray: 4 4
    [*] --> PAGED
    PAGED --> ACKNOWLEDGED: somebody took it
    PAGED --> ESCALATED: nobody did
    ESCALATED --> ACKNOWLEDGED
    ACKNOWLEDGED --> [*]
    class PAGED waiting
`;

/** What Mermaid's parser makes of the text: the classes on each state. */
function classesOf(text: string): Record<string, readonly string[]> {
  const model = parse(text) as unknown as { type: string; states: ReadonlyMap<string, { classes?: readonly string[] }> };
  expect(model.type).toBe("state");
  return Object.fromEntries([...model.states].map(([id, state]) => [id, state.classes ?? []]));
}

describe("amy workflow export", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-export-"));
    const file = path.join(home, "oncall.mmd");
    fs.writeFileSync(file, DRAWN);
    writeWorkflow(home, "oncall", DEFAULT_CONFIG, file);
    const bare = writeWorkflow(home, "bare", loadConfig(home));
    fs.rmSync(path.join(bare, "workflow.mmd"));
    fs.writeFileSync(path.join(bare, "index.ts"), `import { defineWorkflow } from "@amykit/core";
export const plugin = defineWorkflow({
  name: "bare", states: ["done"], terminal: ["done"], configSchema: {}, policy: {}, needs: {},
  plan: () => ({ kind: "settled", why: "done" }), record: () => ({}),
  runtime: () => ({ found: async () => [], observe: async () => ({}), actions: {}, apply: (record) => record }),
});
`);
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("prints the diagram as it lies beside the workflow", async () => {
    await expect(exportWorkflow(home, "oncall", loadConfig(home))).resolves.toBe(DRAWN);
  });

  it("marks the state a piece of work is in, and Mermaid's parser still reads it", async () => {
    const marked = await exportWorkflow(home, "oncall", loadConfig(home), { state: "ESCALATED" });
    const classes = classesOf(marked);

    expect(classes["ESCALATED"]).toContain("current");
    expect(classes["PAGED"]).toEqual(["waiting"]);
    expect(Object.entries(classes).filter(([, names]) => names.includes("current")).map(([id]) => id)).toEqual(["ESCALATED"]);
  });

  it("reads the diagram without building a runtime whose ports only a mount has", async () => {
    const index = path.join(home, "workflows", "oncall", "index.ts");
    fs.writeFileSync(index, fs.readFileSync(index, "utf-8")
      .replace("import { defineWorkflow, notWritten,", "import { defineWorkflow, notWritten, port,")
      .replace("  needs: {},", "  needs: { tracker: port() },"));

    await expect(exportWorkflow(home, "oncall", loadConfig(home), { state: "PAGED" })).resolves.toContain("class PAGED current");
  });

  it("reads the diagram without a configuration only the mount validates", async () => {
    const index = path.join(home, "workflows", "oncall", "index.ts");
    fs.writeFileSync(index, fs.readFileSync(index, "utf-8").replace(
      "  needs: {},",
      "  needs: {},\n  trackerWrites: ({ config }: { config: Record<string, unknown> }) => ((config.repos as string[]).includes(\"acme/widgets\") ? [\"comment\"] : []),",
    ));

    await expect(exportWorkflow(home, "oncall", loadConfig(home))).resolves.toBe(DRAWN);
  });

  it("resolves a workflow configured by a path relative to amy's home, wherever it runs", async () => {
    const config = loadConfig(home);
    const relative = { ...config, workflows: { ...config.workflows, oncall: { ...config.workflows.oncall!, workflow: "./workflows/oncall/index.ts" } } };

    // The resolver the command uses, which takes a directory to its entry.
    const resolve = pluginsRootResolver(home, path.join(home, "plugins"));

    await expect(exportWorkflow(home, "oncall", relative, { resolve })).resolves.toBe(DRAWN);
  });

  it("refuses a state the diagram does not draw, and a workflow that has no diagram", async () => {
    await expect(exportWorkflow(home, "oncall", loadConfig(home), { state: "LOST" })).rejects.toThrow(/draws no `LOST`/);
    await expect(exportWorkflow(home, "bare", loadConfig(home))).rejects.toThrow(/bare has no workflow\.mmd: its states are declared in its code/);
    await expect(exportWorkflow(home, "nobody", loadConfig(home))).rejects.toThrow(/there is no `nobody` workflow/);
  });

  describe("--expand", () => {
    const CALLER = `stateDiagram-v2
    [*] --> PAGED
    PAGED --> REVIEW
    state "look at it · review" as REVIEW
    REVIEW --> RESOLVED: APPROVED
    REVIEW --> DROPPED: DECLINED
    RESOLVED --> [*]
    DROPPED --> [*]
    class REVIEW call
`;

    /** A workflow that calls one of its own, copied into its directory the way `amy workflow add --into` leaves it. */
    function pager(): void {
      const file = path.join(home, "pager.mmd");
      fs.writeFileSync(file, CALLER);
      const directory = writeWorkflow(home, "pager", loadConfig(home), file);
      fs.writeFileSync(path.join(directory, "index.ts"), `import { call, defineWorkflow, settled } from "@amykit/core";
import { plugin as review } from "./workflows/review/index.ts";
export const plugin = defineWorkflow({
  name: "pager", configSchema: {}, policy: {}, needs: {},
  calls: { REVIEW: call(review) },
  decide: { PAGED: () => settled("paged"), RESOLVED: () => settled("resolved"), DROPPED: () => settled("dropped") },
  record: () => ({}), observe: async () => ({}), actions: {},
});
`);
      const callee = path.join(directory, "workflows", "review");
      fs.mkdirSync(callee, { recursive: true });
      fs.writeFileSync(path.join(callee, "workflow.mmd"), "stateDiagram-v2\n    [*] --> READING\n    READING --> APPROVED: it holds\n    READING --> DECLINED\n    APPROVED --> [*]\n    DECLINED --> [*]\n    class READING waiting\n");
      fs.writeFileSync(path.join(callee, "index.ts"), `import { defineWorkflow, settled, withDiagramBeside } from "@amykit/core";
export const plugin = withDiagramBeside(defineWorkflow({
  name: "review", configSchema: {}, policy: {}, needs: {},
  decide: { READING: () => settled("reading"), APPROVED: () => settled("approved"), DECLINED: () => settled("declined") },
  record: () => ({}), observe: async () => ({}), actions: {},
}), import.meta.url);
`);
    }

    it("draws each call as a composite state holding the workflow it calls, which Pele parses", async () => {
      pager();

      const expanded = await exportWorkflow(home, "pager", loadConfig(home), { expand: true });
      const model = parse(expanded) as unknown as { type: string; states: ReadonlyMap<string, { doc?: readonly unknown[]; classes?: readonly string[] }> };

      expect(model.type).toBe("state");
      expect(model.states.get("REVIEW")?.doc?.length).toBeGreaterThan(0);
      expect(model.states.get("REVIEW")?.classes).toContain("call");
      expect(model.states.get("REVIEW__READING")?.classes).toContain("waiting");
      expect(expanded).toContain("state REVIEW {");
      expect(expanded).toContain("REVIEW__READING --> REVIEW__APPROVED: it holds");
    });

    it("leaves the diagram as drawn without --expand, so the source keeps refusing a composite state", async () => {
      pager();

      await expect(exportWorkflow(home, "pager", loadConfig(home))).resolves.toBe(CALLER);
    });

    it("marks a piece of work at every depth of the calls it is in", async () => {
      pager();
      const record = {
        id: "page-1", state: "REVIEW", updatedAt: "", attempts: {}, history: [], calling: "page-1/REVIEW#1",
        calls: { "page-1/REVIEW#1": { id: "page-1/REVIEW#1", state: "READING", updatedAt: "", attempts: {}, history: [] } },
      };

      const classes = classesOf(await exportWorkflow(home, "pager", loadConfig(home), { expand: true, record }));

      expect(Object.entries(classes).filter(([, names]) => names.includes("current")).map(([id]) => id).sort()).toEqual(["REVIEW", "REVIEW__READING"]);
    });
  });
});
