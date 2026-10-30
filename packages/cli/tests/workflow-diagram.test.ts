import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { inspectWorkflow, writeWorkflow } from "../src/workflow.js";

const DRAWN = `stateDiagram-v2
    [*] --> PAGED
    PAGED --> ACKNOWLEDGED: somebody took it
    PAGED --> ESCALATED: nobody did
    ESCALATED --> ACKNOWLEDGED
    ACKNOWLEDGED --> [*]
    class PAGED waiting
`;

describe("a workflow drawn in another tool", () => {
  let home: string;
  let file: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-drawn-"));
    file = path.join(home, "oncall.mmd");
    fs.writeFileSync(file, DRAWN);
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("is copied in beside a scaffold that declares no states", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG, file);

    expect(fs.readFileSync(path.join(directory, "workflow.mmd"), "utf-8")).toBe(DRAWN);
    const index = fs.readFileSync(path.join(directory, "index.ts"), "utf-8");
    expect(index).not.toMatch(/states:|waiting:|terminal:/);
    expect(index).toContain('"ESCALATED": notWritten(),');
  });

  it("mounts, and its check lists every stub and every arrow not walked, as a to-do list rather than a failure", async () => {
    writeWorkflow(home, "oncall", DEFAULT_CONFIG, file);

    const check = await inspectWorkflow(home, "oncall", loadConfig(home));

    expect(check.problems).toEqual([]);
    expect(check.stubs).toEqual(["PAGED", "ACKNOWLEDGED", "ESCALATED"]);
    expect(check.drawnNotWalked.map((edge) => `${edge.from}>${edge.to}`)).toEqual(["PAGED>ACKNOWLEDGED", "PAGED>ESCALATED", "ESCALATED>ACKNOWLEDGED"]);
  });

  it("refuses a diagram amy cannot read with its line, and writes nothing", () => {
    fs.writeFileSync(file, "stateDiagram-v2\n[*] --> A\nstate pick <<choice>>\nA --> [*]\n");

    expect(() => writeWorkflow(home, "oncall", DEFAULT_CONFIG, file)).toThrow(/oncall\.mmd line 3: `<<choice>>` is not read/);
    expect(fs.existsSync(path.join(home, "workflows", "oncall"))).toBe(false);
  });

  it("fails a written decision that moves where the diagram draws no arrow, naming both ends", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG, file);
    const index = path.join(directory, "index.ts");
    fs.writeFileSync(index, fs.readFileSync(index, "utf-8").replace(
      '"PAGED": notWritten(),',
      '"PAGED": () => ({ kind: "advance", to: "ACKNOWLEDGED", effects: [], why: "took it" }),\n  "ACKNOWLEDGED": () => ({ kind: "advance", to: "PAGED", effects: [], why: "again" }),',
    ).replace('  "ACKNOWLEDGED": notWritten(),\n', ""));

    const check = await inspectWorkflow(home, "oncall", loadConfig(home));

    expect(check.problems).toContain("oncall: `ACKNOWLEDGED` moves to `PAGED`, and workflow.mmd draws no arrow from `ACKNOWLEDGED` to `PAGED`");
  });
});
