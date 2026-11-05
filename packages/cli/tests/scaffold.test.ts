import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, withDiagramBeside, WORKFLOW_RUNTIME, type Plugin, type WorkflowRuntime } from "@amykit/core";
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
    const entry = path.join(directory, "decide.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'advance("done", "the work was received")',
      'act("it keeps trying")',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: did not settle; it kept acting in `received`",
    );
  });

  it("refuses a state its walkthrough never reaches", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const diagram = path.join(directory, "workflow.mmd");
    fs.writeFileSync(diagram, fs.readFileSync(diagram, "utf-8").replace(
      "    done --> [*]",
      "    received --> stranded\n    stranded --> done\n    done --> [*]",
    ));

    expect((await checkWorkflow(home, "oncall", loadConfig(home))).join("; ")).toContain(
      "the oncall workflow's `decide` does not match its states: missing `stranded`",
    );
  });

  it("refuses an action the plan emits and the runtime never declared", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "decide.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace(
      'advance("done", "the work was received")',
      'advance("done", "the work was received", { type: "page" })',
    ));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toContain(
      "oncall: plan emits `page`, which its runtime never declared in `actions`",
    );
  });

  it("refuses an action declared with nothing behind it, before driving anything", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "actions.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace("export const actions = {};", "export const actions = { page: undefined };"));

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([
      "oncall: declares `page` with no implementation — give it a handler, or a port and a method",
    ]);
  });

  it("writes the three pieces each in its file, and one declaration that joins them", () => {
    for (const [name, from] of [["plain", undefined], ["imported", diagramFile(home)]] as const) {
      const directory = writeWorkflow(home, name, DEFAULT_CONFIG, from);
      const source = (file: string) => fs.readFileSync(path.join(directory, file), "utf-8");

      expect(fs.readdirSync(directory).filter((file) => /\.(ts|mmd)$/.test(file)).sort()).toEqual(["actions.ts", "decide.ts", "index.test.ts", "index.ts", "workflow.mmd"]);
      expect(source("index.ts").match(/defineWorkflow\(/g)).toHaveLength(1);
      expect(source("index.ts")).toContain('import { decide } from "./decide.ts";');
      expect(source("index.ts")).toContain('import { actions, remember } from "./actions.ts";');
      expect(source("decide.ts")).toMatch(/export const decide/);
      expect(source("actions.ts")).toMatch(/export const actions/);
      for (const file of ["index.ts", "decide.ts", "actions.ts", "index.test.ts"]) {
        expect(source(file)).not.toContain("registry.workflow(");
        expect(source(file)).not.toMatch(/function runtime\(|states:/);
      }
    }
  });

  it("writes one stub per drawn state into decide.ts for a workflow imported from a diagram", () => {
    const directory = writeWorkflow(home, "imported", DEFAULT_CONFIG, diagramFile(home));

    expect(fs.readFileSync(path.join(directory, "decide.ts"), "utf-8")).toContain('"PAGED": notWritten(),');
  });

  // Every workflow amy mounts from ~/.amy/workflows is a declaration with a
  // diagram: one that registers its workflow by hand is refused by name and
  // told what to move onto, rather than checked.
  it("refuses a workflow that registers itself by hand, naming what to move onto", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "index.ts");
    fs.writeFileSync(entry, RAW_PLUGIN);
    fs.rmSync(path.join(directory, "workflow.mmd"));
    fs.mkdirSync(path.join(directory, "node_modules", "@amykit"), { recursive: true });
    const mountedCore = path.join(directory, "node_modules", "@amykit", "core");
    if (!fs.existsSync(mountedCore)) {
      fs.symlinkSync(path.resolve(here, "../../core"), mountedCore, "dir");
    }

    expect((await checkWorkflow(home, "oncall", loadConfig(home))).join("\n")).toContain(
      "failed to register — workflow-legacy registers a workflow by hand; amy mounts a workflow declared with `defineWorkflow` and a workflow.mmd beside it",
    );
  });

  it("writes a suite that passes on its first run", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    const run = suiteOf(directory);

    // Either reporter: TAP writes `# pass 7`, the spec reporter `ℹ pass 7`: one per property the kit checks.
    expect(run.stdout).toMatch(/[#ℹ] pass 7\b/);
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("writes a suite that goes red, naming the state, when a drawn state has no decision", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const diagram = path.join(directory, "workflow.mmd");
    fs.writeFileSync(diagram, fs.readFileSync(diagram, "utf-8").replace(
      "    done --> [*]",
      "    received --> stranded\n    stranded --> done\n    done --> [*]",
    ));

    const run = suiteOf(directory);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("the oncall workflow's `decide` does not match its states: missing `stranded`");
  });

  it("names the testkit it runs at this command's own version", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const cli = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf-8")) as { version: string };

    expect(JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8"))).toMatchObject({
      scripts: { test: "node --test" },
      devDependencies: { "@amykit/workflow-testkit": `^${cli.version}` },
    });
  });

  it("names the core as a dependency, since the declarations it publishes import it", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const cli = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf-8")) as { version: string };
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as { dependencies: object; devDependencies: object };

    expect(manifest.dependencies).toEqual({ "@amykit/core": `^${cli.version}` });
    expect(manifest.devDependencies).not.toHaveProperty("@amykit/core");
  });

  it("writes TypeScript that typechecks against the core it plugs into", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);

    const run = tscIn(directory, "--noEmit");

    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("goes red at the type check when the plan returns something the core does not take", () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "decide.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replace('settled("the workflow is complete")', '{ kind: "finished" }'));

    const run = tscIn(directory, "--noEmit");

    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("decide.ts");
  });

  it("hands an action written in actions.ts the scope the mount builds", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const entry = path.join(directory, "actions.ts");
    fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8")
      .replace('import type { WorkRecord } from "@amykit/core";', 'import { workflowActions, type WorkRecord } from "@amykit/core";')
      .replace("export const actions = {};", `export const actions = workflowActions<{ type: "announce"; text: string }>()({
  announce: async (scope, _work, effect) => {
    if (typeof scope.announce !== "function" || typeof scope.ports !== "object" || effect.text !== "hello") throw new Error("wrong action scope");
  },
});`));

    const run = tscIn(directory);
    expect(run.status, run.stdout + run.stderr).toBe(0);

    const runtime = await mountedRuntime(path.join(directory, "dist", "index.js"));
    const handler = runtime.actions.announce;
    if (typeof handler !== "function") throw new Error("the mount did not build the action");
    await expect(handler(
      { type: "announce", text: "hello" },
      { record: runtime.newRecord("w-1", new Date(0)), observation: {}, outcomes: {} },
    )).resolves.toBeUndefined();
  });

  it("starts a record in the state the diagram beside it starts in", async () => {
    for (const [name, from] of [["plain", undefined], ["imported", diagramFile(home)]] as const) {
      const directory = writeWorkflow(home, name, DEFAULT_CONFIG, from);
      const run = tscIn(directory);
      expect(run.status, run.stdout + run.stderr).toBe(0);

      const runtime = await mountedRuntime(path.join(directory, "dist", "index.js"));
      const record = runtime.newRecord("w-1", new Date("2026-10-30T00:00:00Z"));
      expect(record.state).toBe(from ? "PAGED" : "received");
    }
  });

  it("builds the JavaScript it publishes, since Node will not run TypeScript from node_modules", async () => {
    const directory = writeWorkflow(home, "oncall", DEFAULT_CONFIG);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as { main: string; files: string[] };

    const run = tscIn(directory);

    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(manifest.files).toEqual(["dist", "workflow.mmd"]);
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

/** A diagram drawn in another tool, for `amy workflow new --from`. */
function diagramFile(home: string): string {
  const file = path.join(home, "oncall.mmd");
  fs.writeFileSync(file, "stateDiagram-v2\n    [*] --> PAGED\n    PAGED --> [*]\n");
  return file;
}

/** The built workflow, mounted the way amy mounts it: bound to the diagram at its package root. */
async function mountedRuntime(built: string): Promise<WorkflowRuntime> {
  const { plugin } = (await import(pathToFileURL(built).href)) as { plugin: Plugin };
  const outcome = await mount([withDiagramBeside(plugin, built)], {}, {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date(0),
    paths: { workspace: os.tmpdir(), checkouts: {}, state: os.tmpdir() },
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const runtime = [...(outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.values() ?? [])][0];
  return runtime as WorkflowRuntime;
}

/**
 * A workflow written the way every one of them was before the declaration:
 * both halves registered by hand, which amy no longer mounts.
 */
const RAW_PLUGIN = `import type { Plugin, WorkRecord, Workflow, WorkflowRuntime } from "@amykit/core";

export const workflow: Workflow = {
  name: "legacy",
  states: ["done"],
  waitingStates: [],
  initialState: "done",
  terminalStates: ["done"],
  plan: () => ({ kind: "settled", why: "the work is over" }),
};

export const plugin: Plugin = {
  name: "workflow-legacy",
  register(registry) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", workflow.name, {
      policy: {},
      found: async () => [],
      newRecord: (id, now): WorkRecord => ({
        id, state: "done", updatedAt: now.toISOString(), attempts: {}, history: [],
      }),
      observe: async () => ({}),
      actions: {},
      apply: (record) => record,
    } as WorkflowRuntime);
  },
};
`;

/**
 * Runs the scaffold's own `npm test`, the way its author would after
 * `npm install`: the testkit is linked in as the built package, which is what
 * a registry install would put there.
 */
function suiteOf(directory: string) {
  const testkit = path.resolve(here, "../../workflow-testkit");
  const core = path.resolve(here, "../../core");
  if (!fs.existsSync(path.join(testkit, "dist", "index.js"))) {
    throw new Error("the testkit is not built: run `npm run build` before this test");
  }
  fs.mkdirSync(path.join(directory, "node_modules", "@amykit"), { recursive: true });
  fs.symlinkSync(testkit, path.join(directory, "node_modules", "@amykit", "workflow-testkit"), "dir");
  const mountedCore = path.join(directory, "node_modules", "@amykit", "core");
  if (!fs.existsSync(mountedCore)) fs.symlinkSync(core, mountedCore, "dir");
  return spawnSync(process.execPath, ["--test"], { cwd: directory, encoding: "utf-8" });
}

/**
 * Runs the scaffold's own `tsc` the way its author would after `npm install`:
 * the core and the compiler are linked in from this workspace.
 */
function tscIn(directory: string, ...args: string[]) {
  const modules = path.resolve(here, "../../../node_modules");
  fs.mkdirSync(path.join(directory, "node_modules", "@amykit"), { recursive: true });
  const mountedCore = path.join(directory, "node_modules", "@amykit", "core");
  if (!fs.existsSync(mountedCore)) fs.symlinkSync(path.resolve(here, "../../core"), mountedCore, "dir");
  fs.symlinkSync(path.join(modules, "typescript"), path.join(directory, "node_modules", "typescript"), "dir");
  return spawnSync(process.execPath, [path.join(modules, "typescript", "bin", "tsc"), "-p", directory, ...args], { cwd: directory, encoding: "utf-8" });
}
