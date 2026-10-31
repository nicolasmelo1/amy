import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommandResult, CommandRunner } from "@amykit/core";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { addWorkflowInto } from "../src/workflow-add.js";
import { checkWorkflow, exportWorkflow, inspectWorkflow, writeWorkflow } from "../src/workflow.js";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * `npm`, as far as copying a workflow asks it: whether the registry knows a
 * version, and installing one. Installing links the package this repository
 * already has into the caller, so what the copy imports genuinely resolves.
 */
class Npm implements CommandRunner {
  readonly installed: { cwd: string; packages: string[] }[] = [];

  constructor(private readonly known: readonly string[]) {}

  async run(command: string, args: readonly string[], options: { cwd?: string } = {}): Promise<CommandResult> {
    if (command !== "npm") return { ok: false, exitCode: 1, stdout: "", stderr: `${command} is not npm` };
    const [verb, ...rest] = args;
    if (verb === "view") {
      const name = rest[0]!.slice(0, rest[0]!.lastIndexOf("@"));
      return this.known.includes(name)
        ? { ok: true, exitCode: 0, stdout: "\"2.8.1\"", stderr: "" }
        : { ok: false, exitCode: 1, stdout: "", stderr: `npm error 404 '${name}' is not in this registry` };
    }
    const packages = rest.filter((arg) => !arg.startsWith("--"));
    this.installed.push({ cwd: options.cwd!, packages });
    for (const spec of packages) {
      const name = spec.slice(0, spec.lastIndexOf("@"));
      const into = path.join(options.cwd!, "node_modules", name);
      fs.mkdirSync(path.dirname(into), { recursive: true });
      fs.symlinkSync(path.join(REPOSITORY, "node_modules", name), into, "dir");
    }
    return { ok: true, exitCode: 0, stdout: "", stderr: "" };
  }
}

const CALLEE_DIAGRAM = "stateDiagram-v2\n    [*] --> READING\n    READING --> APPROVED\n    READING --> DECLINED\n    APPROVED --> [*]\n    DECLINED --> [*]\n";

/** A workflow package spread over three files, two of them reached only by relative imports, and one dependency. */
function reviewPackage(root: string, dependencies: Record<string, string>): string {
  const directory = path.join(root, "acme-workflow-review");
  fs.mkdirSync(path.join(directory, "src", "words"), { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({
    name: "@acme/workflow-review",
    type: "module",
    exports: { ".": { import: "./index.ts" } },
    dependencies: { "@amykit/core": "^0.6.0", ...dependencies },
  }, null, 2));
  fs.writeFileSync(path.join(directory, "workflow.mmd"), CALLEE_DIAGRAM);
  fs.writeFileSync(path.join(directory, "index.ts"), `import { defineWorkflow, withDiagramBeside } from "@amykit/core";
import { decide } from "./src/decide.js";
export const plugin = withDiagramBeside(defineWorkflow({
  name: "review", configSchema: {}, policy: {}, needs: {}, decide,
  record: () => ({}), observe: async () => ({}), actions: {},
}), import.meta.url);
`);
  fs.writeFileSync(path.join(directory, "src", "decide.ts"), `import { settled } from "@amykit/core";
import { verdict } from "./words/verdict.ts";
export const decide = { READING: () => settled(verdict("reading")), APPROVED: () => settled("approved"), DECLINED: () => settled("declined") };
`);
  fs.writeFileSync(path.join(directory, "src", "words", "verdict.ts"), `import { stringify } from "yaml";
export const verdict = (word: string): string => stringify(word).trim();
`);
  fs.writeFileSync(path.join(directory, "NOTES.md"), "what nothing imports is not the workflow\n");
  return directory;
}

describe("amy workflow add --into", () => {
  let home: string;
  let elsewhere: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-into-"));
    elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "amy-callee-"));
    const file = path.join(home, "oncall.mmd");
    fs.writeFileSync(file, "stateDiagram-v2\n    [*] --> PAGED\n    PAGED --> REVIEW\n    REVIEW --> RESOLVED: APPROVED\n    REVIEW --> DROPPED: DECLINED\n    RESOLVED --> [*]\n    DROPPED --> [*]\n    class REVIEW call\n");
    writeWorkflow(home, "oncall", DEFAULT_CONFIG, file);
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  });

  it("copies a multi-file callee whose relative imports and package dependencies still resolve", async () => {
    const npm = new Npm(["yaml"]);
    const caller = path.join(home, "workflows", "oncall");

    const { directory: target, entry } = await addWorkflowInto(home, reviewPackage(elsewhere, { yaml: "^2.8.1" }), "oncall", { runner: npm });

    expect(target).toBe(path.join(caller, "workflows", "review"));
    expect(entry).toBe(path.join(target, "index.ts"));
    // Node imports the file a specifier names, so the `.js` written for a `.ts` names the copy.
    expect(fs.readFileSync(path.join(target, "index.ts"), "utf-8")).toContain('from "./src/decide.ts"');
    const copied = fs.readdirSync(target, { recursive: true }).map(String).sort();
    expect(copied).toEqual(["index.ts", "package.json", "src", "src/decide.ts", "src/words", "src/words/verdict.ts", "workflow.mmd"]);
    expect(npm.installed).toEqual([{ cwd: caller, packages: ["yaml@^2.8.1"] }]);

    // Called the way any workflow is, which imports the whole copied tree.
    fs.writeFileSync(path.join(caller, "index.ts"), `import { call, defineWorkflow, settled } from "@amykit/core";
import { plugin as review } from "./workflows/review/index.ts";
export const plugin = defineWorkflow({
  name: "oncall", configSchema: {}, policy: {}, needs: {},
  calls: { REVIEW: call(review) },
  decide: { PAGED: () => settled("paged"), RESOLVED: () => settled("resolved"), DROPPED: () => settled("dropped") },
  record: () => ({}), observe: async () => ({}), actions: {},
});
`);
    await expect(exportWorkflow(home, "oncall", loadConfig(home), { expand: true })).resolves.toContain("REVIEW__READING --> REVIEW__APPROVED");
  });

  it("refuses a callee whose dependency cannot be resolved, before anything is written", async () => {
    const npm = new Npm([]);
    const manifest = path.join(home, "workflows", "oncall", "package.json");
    const before = fs.readFileSync(manifest, "utf-8");

    await expect(addWorkflowInto(home, reviewPackage(elsewhere, { "left-pad-that-never-was": "^9.0.0" }), "oncall", { runner: npm }))
      .rejects.toThrow("@acme/workflow-review depends on left-pad-that-never-was@^9.0.0, which cannot be resolved; nothing was copied");

    expect(fs.existsSync(path.join(home, "workflows", "oncall", "workflows"))).toBe(false);
    expect(fs.readFileSync(manifest, "utf-8")).toBe(before);
    expect(npm.installed).toEqual([]);
  });

  it("refuses a callee needing a version of a dependency the caller holds at one it cannot use", async () => {
    const caller = path.join(home, "workflows", "oncall");
    const manifest = JSON.parse(fs.readFileSync(path.join(caller, "package.json"), "utf-8")) as { dependencies: Record<string, string> };
    manifest.dependencies.yaml = "^1.10.0";
    fs.writeFileSync(path.join(caller, "package.json"), JSON.stringify(manifest));
    fs.mkdirSync(path.join(caller, "node_modules", "yaml"), { recursive: true });
    fs.writeFileSync(path.join(caller, "node_modules", "yaml", "package.json"), JSON.stringify({ name: "yaml", version: "1.10.2" }));

    await expect(addWorkflowInto(home, reviewPackage(elsewhere, { yaml: "^2.8.1" }), "oncall", { runner: new Npm(["yaml"]) }))
      .rejects.toThrow("@acme/workflow-review depends on yaml@^2.8.1, and oncall holds 1.10.2; nothing was copied");
    expect(fs.existsSync(path.join(caller, "workflows"))).toBe(false);
  });

  it("keeps a workflow the callee imports with its own diagram and manifest, and checks what it depends on", async () => {
    const source = reviewPackage(elsewhere, {});
    const nested = path.join(source, "src", "fix");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, "workflow.mmd"), "stateDiagram-v2\n    [*] --> FIXING\n    FIXING --> [*]\n");
    fs.writeFileSync(path.join(nested, "package.json"), JSON.stringify({ name: "workflow-fix", type: "module", dependencies: { "left-pad-that-never-was": "^9.0.0" } }));
    fs.writeFileSync(path.join(nested, "index.ts"), "export const fix = 1;\n");
    fs.appendFileSync(path.join(source, "src", "decide.ts"), 'export { fix } from "./fix/index.ts";\n');

    await expect(addWorkflowInto(home, source, "oncall", { runner: new Npm([]) })).rejects.toThrow("left-pad-that-never-was@^9.0.0, which cannot be resolved");

    fs.writeFileSync(path.join(nested, "package.json"), JSON.stringify({ name: "workflow-fix", type: "module" }));
    const { directory } = await addWorkflowInto(home, source, "oncall", { runner: new Npm([]) });
    expect(["src/fix/workflow.mmd", "src/fix/package.json", "src/fix/index.ts"].every((file) => fs.existsSync(path.join(directory, file)))).toBe(true);
  });

  it("copies an installed package whose exports name only its root, entered where its exports say", async () => {
    const plugins = path.join(home, "plugins");
    const installed = path.join(plugins, "node_modules", "@acme", "workflow-review");
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.cpSync(reviewPackage(elsewhere, {}), installed, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf-8")) as Record<string, unknown>;
    fs.writeFileSync(path.join(installed, "package.json"), JSON.stringify({ ...manifest, exports: "./index.ts" }));

    const { entry } = await addWorkflowInto(home, "@acme/workflow-review", "oncall", { runner: new Npm([]), pluginsRoot: plugins });

    expect(entry).toBe(path.join(home, "workflows", "oncall", "workflows", "review", "index.ts"));
  });

  it("installs nothing the caller already depends on", async () => {
    const npm = new Npm([]);

    await addWorkflowInto(home, reviewPackage(elsewhere, {}), "oncall", { runner: npm });

    expect(npm.installed).toEqual([]);
  });

  it("refuses to copy over a callee already there, and into a workflow that is not one of your own", async () => {
    const npm = new Npm(["yaml"]);
    const source = reviewPackage(elsewhere, {});
    await addWorkflowInto(home, source, "oncall", { runner: npm });

    await expect(addWorkflowInto(home, source, "oncall", { runner: npm })).rejects.toThrow(/already exists/);
    await expect(addWorkflowInto(home, source, "nobody", { runner: npm })).rejects.toThrow("there is no workflow of your own called `nobody`");
  });

  it("leaves a copy its caller's check walks through, the way it would walk the package", async () => {
    const callee = path.join(elsewhere, "approve");
    fs.mkdirSync(callee);
    fs.writeFileSync(path.join(callee, "package.json"), JSON.stringify({ name: "workflow-approve", type: "module", dependencies: { "@amykit/core": "^0.6.0" } }));
    fs.writeFileSync(path.join(callee, "workflow.mmd"), "stateDiagram-v2\n    [*] --> READING\n    READING --> APPROVED\n    APPROVED --> [*]\n");
    fs.writeFileSync(path.join(callee, "index.ts"), `import { advance, defineWorkflow, settled, withDiagramBeside } from "@amykit/core";
export const plugin = withDiagramBeside(defineWorkflow({
  name: "approve", configSchema: {}, policy: {}, needs: {},
  decide: { READING: () => advance("APPROVED", "it holds"), APPROVED: () => settled("approved") },
  record: () => ({}), observe: async () => ({}), actions: {},
}), import.meta.url);
`);
    const caller = path.join(home, "workflows", "oncall");
    fs.writeFileSync(path.join(caller, "workflow.mmd"), "stateDiagram-v2\n    [*] --> PAGED\n    PAGED --> REVIEW\n    REVIEW --> RESOLVED: APPROVED\n    RESOLVED --> [*]\n    class REVIEW call\n");
    fs.writeFileSync(path.join(caller, "index.ts"), `import { advance, call, defineWorkflow, settled } from "@amykit/core";
import { plugin as approve } from "./workflows/approve/index.ts";
export const plugin = defineWorkflow({
  name: "oncall", configSchema: {}, policy: {}, needs: {},
  calls: { REVIEW: call(approve) },
  decide: { PAGED: () => advance("REVIEW", "paged"), RESOLVED: () => settled("resolved") },
  record: () => ({}), observe: async () => ({}), actions: {},
});
`);

    await addWorkflowInto(home, callee, "oncall", { runner: new Npm([]) });

    await expect(checkWorkflow(home, "oncall", loadConfig(home))).resolves.toEqual([]);
  });

  it("holds a copied callee's moves to its own diagram, and lists the arrows it drew and nobody walked", async () => {
    const callee = path.join(elsewhere, "skip");
    fs.mkdirSync(callee);
    fs.writeFileSync(path.join(callee, "package.json"), JSON.stringify({ name: "workflow-skip", type: "module" }));
    fs.writeFileSync(path.join(callee, "workflow.mmd"), "stateDiagram-v2\n    [*] --> READING\n    READING --> HELD\n    HELD --> APPROVED\n    APPROVED --> [*]\n");
    fs.writeFileSync(path.join(callee, "index.ts"), `import { advance, defineWorkflow, settled, withDiagramBeside } from "@amykit/core";
export const plugin = withDiagramBeside(defineWorkflow({
  name: "skip", configSchema: {}, policy: {}, needs: {},
  decide: { READING: () => advance("APPROVED", "straight past HELD"), HELD: () => advance("APPROVED", "held"), APPROVED: () => settled("approved") },
  record: () => ({}), observe: async () => ({}), actions: {},
}), import.meta.url);
`);
    const caller = path.join(home, "workflows", "oncall");
    fs.writeFileSync(path.join(caller, "workflow.mmd"), "stateDiagram-v2\n    [*] --> PAGED\n    PAGED --> REVIEW\n    REVIEW --> RESOLVED: APPROVED\n    RESOLVED --> [*]\n    class REVIEW call\n");
    fs.writeFileSync(path.join(caller, "index.ts"), `import { advance, call, defineWorkflow, settled } from "@amykit/core";
import { plugin as skip } from "./workflows/skip/index.ts";
export const plugin = defineWorkflow({
  name: "oncall", configSchema: {}, policy: {}, needs: {},
  calls: { REVIEW: call(skip) },
  decide: { PAGED: () => advance("REVIEW", "paged"), RESOLVED: () => settled("resolved") },
  record: () => ({}), observe: async () => ({}), actions: {},
});
`);
    await addWorkflowInto(home, callee, "oncall", { runner: new Npm([]) });

    const checked = await inspectWorkflow(home, "oncall", loadConfig(home));

    expect(checked.problems).toContain("oncall → REVIEW: `READING` moves to `APPROVED`, and skip's workflow.mmd draws no arrow from `READING` to `APPROVED`");
    expect(checked.drawnNotWalked.map((edge) => `${edge.from} → ${edge.to}`)).toEqual(["REVIEW/READING → REVIEW/HELD", "REVIEW/HELD → REVIEW/APPROVED"]);
  });
});
