import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
      main: "./dist/index.js",
    });
    expect(loadConfig(home).workflows.oncall?.workflow).toBe("oncall");
    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([]);
  });

  it("resolves a local directory before a package with the same name", () => {
    writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    expect(localWorkflow(home, "oncall")).toMatch(/\/workflows\/oncall\/index\.ts$/);
    expect(workflowSpecifier(home, "oncall")).toBe(localWorkflow(home, "oncall"));
    expect(workflowSpecifier(home, "@acme/oncall")).toBe("@acme/oncall");
  });

  it("refuses a lifecycle that never settles", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
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
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'states: ["received", "done"]',
      'states: ["received", "done", "stranded"]',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: declares `stranded`, but its walkthrough never reaches it",
    );
  });

  it("refuses an action the plan emits and the runtime never declared", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'effects: [], why: "the work was received"',
      'effects: [{ type: "page" }], why: "the work was received"',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: plan emits `page`, which its runtime never declared in `actions`",
    );
  });

  it("refuses an action declared with nothing behind it, before driving anything", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace("actions: {},", "actions: { page: undefined },"));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([
      "oncall: declares `page` with no implementation — give it a handler, or a port and a method",
    ]);
  });

  it("tells a workflow still declaring usesActions what to change", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace("usesObservers: [],", "usesActions: [],\n  usesObservers: [],"));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([
      "oncall: still declares `usesActions`; delete it and key each action in its runtime's `actions`",
    ]);
  });

  it("writes a suite that passes on its first run", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    const run = suiteOf(directory);

    // Either reporter: TAP writes `# pass 6`, the spec reporter `ℹ pass 6`.
    expect(run.stdout).toMatch(/[#ℹ] pass 6\b/);
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("writes a suite that goes red, naming the state, when a state cannot be reached", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'states: ["received", "done"]',
      'states: ["received", "done", "stranded"]',
    ));

    const run = suiteOf(directory);

    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("`stranded` is declared, and no world reaches it");
  });

  it("names the testkit it runs at this command's own version", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const cli = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf-8")) as { version: string };

    expect(JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8"))).toMatchObject({
      scripts: { test: "node --test" },
      devDependencies: { "@amykit/workflow-testkit": `^${cli.version}` },
    });
  });

  it("writes TypeScript that typechecks against the core it plugs into", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    const run = tscIn(directory, "--noEmit");

    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("goes red at the type check when the plan returns something the core does not take", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace('{ kind: "settled", why: "the workflow is complete" }', '{ kind: "finished" }'));

    const run = tscIn(directory, "--noEmit");

    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("index.ts");
  });

  it("builds the JavaScript it publishes, since Node will not run TypeScript from node_modules", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as { main: string; files: string[] };

    const run = tscIn(directory);

    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(manifest.files).toEqual(["dist"]);
    const built = (await import(pathToFileURL(path.join(directory, manifest.main)).href)) as { plugin?: { name: string } };
    expect(built.plugin?.name).toBe("workflow-oncall");
  });

  it("still resolves a workflow written in JavaScript before the scaffold was TypeScript", () => {
    const directory = path.join(workflowsDirectory(home), "legacy");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.js"), "export const plugin = {};\n");

    expect(localWorkflow(home, "legacy")).toMatch(/\/workflows\/legacy\/index\.js$/);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runs the scaffold's own `npm test`, the way its author would after
 * `npm install`: the testkit is linked in as the built package, which is what
 * a registry install would put there.
 */
function suiteOf(directory: string) {
  const testkit = path.resolve(here, "../../workflow-testkit");
  if (!fs.existsSync(path.join(testkit, "dist", "index.js"))) {
    throw new Error("the testkit is not built: run `npm run build` before this test");
  }
  fs.mkdirSync(path.join(directory, "node_modules", "@amykit"), { recursive: true });
  fs.symlinkSync(testkit, path.join(directory, "node_modules", "@amykit", "workflow-testkit"), "dir");
  return spawnSync(process.execPath, ["--test"], { cwd: directory, encoding: "utf-8" });
}

/**
 * Runs the scaffold's own `tsc` the way its author would after `npm install`:
 * the core and the compiler are linked in from this workspace.
 */
function tscIn(directory: string, ...args: string[]) {
  const modules = path.resolve(here, "../../../node_modules");
  fs.mkdirSync(path.join(directory, "node_modules", "@amykit"), { recursive: true });
  fs.symlinkSync(path.resolve(here, "../../core"), path.join(directory, "node_modules", "@amykit", "core"), "dir");
  fs.symlinkSync(path.join(modules, "typescript"), path.join(directory, "node_modules", "typescript"), "dir");
  return spawnSync(process.execPath, [path.join(modules, "typescript", "bin", "tsc"), "-p", directory, ...args], { cwd: directory, encoding: "utf-8" });
}
