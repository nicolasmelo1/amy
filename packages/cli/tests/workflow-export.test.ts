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
    writeWorkflow(home, "bare", loadConfig(home));
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
});
