import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { localWorkflow, checkWorkflow, workflowSpecifier, workflowsDirectory, writeWorkflow } from "../src/workflow.js";

describe("a workflow of your own", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-workflow-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("writes a package that checks before it is edited", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    expect(directory).toBe(path.join(workflowsDirectory(home), "oncall"));
    expect(JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8"))).toMatchObject({
      name: "workflow-oncall",
      type: "module",
      main: "./index.js",
    });
    expect(loadConfig(home).workflows.oncall?.workflow).toBe("oncall");
    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([]);
  });

  it("resolves a local directory before a package with the same name", () => {
    writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    expect(localWorkflow(home, "oncall")).toMatch(/\/workflows\/oncall\/index\.js$/);
    expect(workflowSpecifier(home, "oncall")).toBe(localWorkflow(home, "oncall"));
    expect(workflowSpecifier(home, "@acme/oncall")).toBe("@acme/oncall");
  });

  it("refuses a lifecycle that never settles", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.js");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      '{ kind: "advance", to: "done", effects: [], why: "the work was received" }',
      '{ kind: "act", effects: [], why: "it keeps trying" }',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: did not settle; it kept acting in `received`",
    );
  });

  it("refuses a state its walkthrough never reaches", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.js");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'states: ["received", "done"]',
      'states: ["received", "done", "stranded"]',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: declares `stranded`, but its walkthrough never reaches it",
    );
  });

  it("refuses an action no runtime handler answers", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.js");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'effects: [], why: "the work was received"',
      'effects: [{ type: "page" }], why: "the work was received"',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: plan emits `page`, but no runtime handler answers it",
    );
  });
});
