import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyPlan, isPortBinding, movedBy, Plugin, PluginContext, Registry, undeclaredIn, Workflow, WorkflowRuntime, WorkRecord } from "@amykit/core";
import { AmyConfig, writeWorkflowProfile } from "./config.js";

/** The directory where one machine keeps workflows that belong only to it. */
export function workflowsDirectory(home: string): string {
  return path.join(home, "workflows");
}

/**
 * A local workflow wins over a package with the same unscoped name.
 *
 * Scoped names remain package names: `@acme/oncall` is how an owner shares a
 * workflow later, while `oncall` stays a directory they can edit in place.
 * `index.ts` is what the scaffold writes and Node runs unbuilt; `index.js` is
 * what a workflow written before that, or by hand, still has.
 */
export function localWorkflow(home: string, spec: string): string | undefined {
  if (!isLocalName(spec)) return undefined;

  const directory = path.join(workflowsDirectory(home), spec);
  const entry = ["index.ts", "index.js"].map((file) => path.join(directory, file)).find((file) => fs.existsSync(file));
  return entry ? pathToFileURL(entry).href : undefined;
}

/** Makes an import specifier prefer this machine's workflow directory. */
export function workflowSpecifier(home: string, spec: string): string {
  return localWorkflow(home, spec) ?? spec;
}

/**
 * Writes the smallest complete workflow: a package that runs before editing.
 *
 * TypeScript, because a workflow is typed against the core it plugs into and
 * `sf` reads the shape of TypeScript and not of JavaScript. Node strips the
 * types and runs it from this directory as it is; it refuses TypeScript under
 * `node_modules`, so what is published is what `npm run build` compiles.
 */
export function writeWorkflow(home: string, name: string, config: AmyConfig): string {
  if (!isLocalName(name)) {
    throw new Error("a workflow name is one directory name: letters, numbers, hyphens and underscores");
  }

  const directory = path.join(workflowsDirectory(home), name);
  if (fs.existsSync(directory)) {
    throw new Error(`${directory} already exists; choose another name or edit the workflow there`);
  }

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({
    name: `workflow-${name}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    files: ["dist"],
    scripts: { build: "tsc", typecheck: "tsc --noEmit", test: "node --test", prepack: "npm run build" },
    // A dependency, not a dev one: the published `dist/index.d.ts` imports
    // its types, as every shipped workflow package does.
    dependencies: { "@amykit/core": `^${groupVersion()}` },
    devDependencies: { [TESTKIT]: `^${groupVersion()}`, typescript: TYPESCRIPT },
  }, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify(SCAFFOLD_TSCONFIG, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(directory, "index.ts"), scaffold(name), "utf-8");
  fs.writeFileSync(path.join(directory, "index.test.ts"), scaffoldSuite(), "utf-8");
  writeGuardrails(directory);
  writeWorkflowProfile(home, name, name, config);
  return directory;
}

/** The rules every workflow needs and no author should have to rediscover, shipped with this command. */
const GUARDRAILS = fileURLToPath(new URL("../guardrails/", import.meta.url));

/**
 * Gives a workflow its own `sf` policy: the guardrails as repo-local rules,
 * and one fixture per rule that `sf verify` proves it fires on. Each fixture
 * is a repository of its own, so it carries the one rule it trips.
 */
function writeGuardrails(directory: string): void {
  const factory = path.join(directory, ".software-factory");
  fs.cpSync(path.join(GUARDRAILS, "policy.yaml"), path.join(factory, "policy.yaml"));
  fs.cpSync(path.join(GUARDRAILS, "rules"), path.join(factory, "rules"), { recursive: true });

  for (const [id, file] of guardrailRules()) {
    const fixture = path.join(factory, "mutations", id);
    fs.cpSync(path.join(GUARDRAILS, "mutations", id), fixture, { recursive: true });
    fs.cpSync(path.join(GUARDRAILS, "rules", file), path.join(fixture, ".software-factory", "rules", file));
    fs.writeFileSync(path.join(fixture, ".software-factory", "policy.yaml"), fixturePolicy(id), "utf-8");
  }
}

/** Each guardrail's id, beside the file that declares it. */
export function guardrailRules(): Array<[id: string, file: string]> {
  return fs.readdirSync(path.join(GUARDRAILS, "rules")).sort().map((file) => {
    const id = /^id: (\S+)$/m.exec(fs.readFileSync(path.join(GUARDRAILS, "rules", file), "utf-8"))?.[1];
    if (!id) throw new Error(`guardrail ${file} declares no id`);
    return [id, file];
  });
}

function fixturePolicy(id: string): string {
  return `# Mutation fixture for ${id}. It is supposed to fail.\nversion: 1\nproject:\n  name: mutation-${id}\n  languages: [typescript]\ndocs:\n  scan: []\ngates: {}\nrules:\n  ${id}:\n    enabled: true\n`;
}

export async function checkWorkflow(
  home: string,
  name: string,
  config: AmyConfig,
  resolve: (spec: string) => string = (spec) => workflowSpecifier(home, spec),
): Promise<string[]> {
  const profile = config.workflows[name];
  if (!profile) return [`there is no \`${name}\` workflow in the config`];

  const registered = await registeredWorkflow(home, profile.workflow, resolve);
  if (typeof registered === "string") return [registered];
  return drive(registered);
}

interface RegisteredWorkflow {
  workflow: Workflow;
  runtime: WorkflowRuntime;
  now: () => Date;
}

async function registeredWorkflow(home: string, spec: string, resolve: (spec: string) => string): Promise<RegisteredWorkflow | string> {
  const plugin = await importedPlugin(spec, resolve);
  if (typeof plugin === "string") return plugin;

  let workflow: Workflow | undefined;
  const contributions = new Map<string, Map<string, object>>();
  const registry = recordingRegistry((value) => { workflow = value; }, contributions);
  const now = () => new Date("2026-01-01T00:00:00.000Z");
  try {
    await plugin.register(registry, context(home, now, contributions, () => workflow));
  } catch (error) {
    return `${spec}: failed to register — ${message(error)}`;
  }
  if (!workflow) return `${spec}: registered no workflow`;

  const runtime = contributions.get("workflow-runtime")?.get(workflow.name) as WorkflowRuntime | undefined;
  return runtime ? { workflow, runtime, now } : `${workflow.name}: contributed no runtime, so nothing here knows how to run its actions`;
}

async function importedPlugin(spec: string, resolve: (spec: string) => string): Promise<Plugin | string> {
  try {
    const loaded = (await import(resolve(spec))) as { plugin?: Plugin };
    return loaded.plugin ?? `${spec}: imported, but exports no \`plugin\``;
  } catch (error) {
    const unbuilt = (error as { code?: unknown }).code === "ERR_UNKNOWN_FILE_EXTENSION"
      ? "; this Node cannot run TypeScript unbuilt, which takes 22.18 or later"
      : "";
    return `${spec}: could not be imported — ${message(error)}${unbuilt}`;
  }
}

function recordingRegistry(
  setWorkflow: (workflow: Workflow) => void,
  contributions: Map<string, Map<string, object>>,
): Registry {
  return {
    queue: () => undefined, store: () => undefined, engine: () => undefined,
    workflow: setWorkflow, port: () => undefined, action: () => undefined, observer: () => undefined,
    contribute: (collection, name, value) => {
      const values = contributions.get(collection) ?? new Map<string, object>();
      values.set(name, value);
      contributions.set(collection, values);
    },
  };
}

function context(
  home: string,
  now: () => Date,
  contributions: Map<string, Map<string, object>>,
  workflow: () => Workflow | undefined,
): PluginContext {
  return {
    config: {}, runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) }, now,
    paths: { workspace: home, checkouts: {}, state: home },
    contributions: (collection) => contributions.get(collection) ?? new Map(),
    port: () => undefined,
    workflow: () => workflow() as Workflow<never, never> | undefined,
  };
}

async function drive({ workflow, runtime, now }: RegisteredWorkflow): Promise<string[]> {
  const unimplemented = unimplementedActions(workflow, runtime);
  if (unimplemented.length > 0) return unimplemented;
  const created = recordFor(workflow, runtime, now);
  if (typeof created === "string") return [created];
  let record = created;
  const reached = new Set<string>();
  const problems = record.state === workflow.initialState ? [] : [`${workflow.name}: newRecord starts at \`${record.state}\`, not \`${workflow.initialState}\``];

  for (let move = 0; move < 32 && problems.length === 0; move += 1) {
    reached.add(record.state);
    const next = await moveOnce(workflow, runtime, record, now);
    if (typeof next === "string") { problems.push(next); break; }
    if (next.kind === "settled" || next.kind === "wait") break;
    record = next.record;
  }
  return [...problems, ...completionProblems(workflow, record, reached)];
}

/** Declared actions with nothing behind them, which the mount would refuse at boot. */
function unimplementedActions(workflow: Workflow, runtime: WorkflowRuntime): string[] {
  if (Object.hasOwn(workflow, "usesActions")) {
    return [`${workflow.name}: still declares \`usesActions\`; delete it and key each action in its runtime's \`actions\``];
  }
  if (runtime.actions === null || typeof runtime.actions !== "object") {
    return [`${workflow.name}: its runtime declares no \`actions\` — one map from each action it emits to what runs it`];
  }
  return Object.entries(runtime.actions)
    .filter(([, implementation]) => typeof implementation !== "function" && !isPortBinding(implementation))
    .map(([name]) => `${workflow.name}: declares \`${name}\` with no implementation — give it a handler, or a port and a method`);
}

function recordFor(workflow: Workflow, runtime: WorkflowRuntime, now: () => Date): WorkRecord | string {
  try { return runtime.newRecord("workflow-check", now()); }
  catch (error) { return `${workflow.name}: newRecord failed — ${message(error)}`; }
}

async function moveOnce(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, now: () => Date): Promise<{ kind: "advance"; record: WorkRecord } | { kind: "settled" } | { kind: "wait" } | string> {
  try {
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    const [missing] = undeclaredIn(runtime, plan);
    if (missing) return `${workflow.name}: plan emits \`${missing}\`, which its runtime never declared in \`actions\``;
    if (plan.kind === "settled") return { kind: "settled" };
    if (plan.kind === "wait") return waitingProblem(workflow, runtime, record);
    if (plan.kind === "act") return `${workflow.name}: did not settle; it kept acting in \`${record.state}\``;
    if (!workflow.states.includes(plan.to)) return `${workflow.name}: advances to undeclared state \`${plan.to}\``;
    const folded = runtime.apply(applyPlan(record, plan, now()), plan, {}, observation, now(), movedBy(record, plan));
    return folded.state === plan.to ? { kind: "advance", record: folded } : `${workflow.name}: one look did not make the transition it claimed`;
  } catch (error) { return `${workflow.name}: could not plan \`${record.state}\` — ${message(error)}`; }
}

async function waitingProblem(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord): Promise<{ kind: "wait" } | string> {
  const again = workflow.plan(record, await runtime.observe(record), runtime.policy);
  return again.kind === "wait" ? { kind: "wait" } : `${workflow.name}: a waiting state moved before the world did`;
}

function completionProblems(workflow: Workflow, record: WorkRecord, reached: Set<string>): string[] {
  const problems = workflow.terminalStates.includes(record.state) ? [] : [`${workflow.name}: did not settle in a terminal state`];
  return [...problems, ...workflow.states.filter((state) => !reached.has(state)).map((state) => `${workflow.name}: declares \`${state}\`, but its walkthrough never reaches it`)];
}

function isLocalName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The kit the scaffold's own suite runs, which moves in the same version group as this command. */
const TESTKIT = "@amykit/workflow-testkit";

/** The first TypeScript with `erasableSyntaxOnly`, which holds the scaffold to what Node can strip. */
const TYPESCRIPT = "^5.8.0";

/** Compiles `index.ts` alone for publishing; the suite imports it by its `.ts` name and is never built. */
const SCAFFOLD_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    erasableSyntaxOnly: true,
    verbatimModuleSyntax: true,
    declaration: true,
    outDir: "dist",
    skipLibCheck: true,
  },
  include: ["index.ts"],
};

/**
 * This command's version, which is every `@amykit` package's version: they
 * move as one fixed group (`.changeset/config.json`), so the core and the
 * testkit a scaffold names always exist at it.
 */
function groupVersion(): string {
  const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };
  return manifest.version;
}

function scaffold(name: string): string {
  return `// This workflow belongs to this machine. Edit the states and the two halves below.
// \`amy workflow check ${name}\` drives this file before it drives real work,
// and \`npm test\` runs the machine's own suite over it. Node runs it as it is;
// \`npm run build\` compiles it for publishing.
import type { Plugin, WorkRecord, Workflow, WorkflowRuntime } from "@amykit/core";

export const workflow: Workflow = {
  name: ${JSON.stringify(name)},
  states: ["received", "done"],
  waitingStates: [],
  initialState: "received",
  terminalStates: ["done"],
  usesObservers: [],
  plan: (record) =>
    record.state === "received"
      ? { kind: "advance", to: "done", effects: [], why: "the work was received" }
      : { kind: "settled", why: "the workflow is complete" },
};

// A function rather than an object, so the suite builds its own. When this
// runtime needs a port, take it as an argument: the suite hands it a fake and
// the plugin below hands it the mounted one.
export function runtime(): WorkflowRuntime {
  return {
    policy: {},
    found: async () => ["example"],
    newRecord: (id, now): WorkRecord => ({ id, state: "received", updatedAt: now.toISOString(), attempts: {}, history: [] }),
    observe: async () => ({}),
    // Every action the plan may emit, keyed by name, and what runs it: a
    // handler, or { port, method } for a mounted port the host calls.
    actions: {},
    // Called as (record, plan, outcomes, observation, now, moved). \`record\`
    // has already moved: read where it came from in \`moved.from\`, never in
    // \`record.state\`. \`moved\` is null when the plan did not advance.
    apply: (record) => record,
  };
}

export const plugin: Plugin = {
  name: ${JSON.stringify(`workflow-${name}`)},
  version: "0.1.0",
  register(registry) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", workflow.name, runtime());
  },
};
`;
}

/**
 * The suite every workflow needs and nobody writes, from its first commit.
 *
 * `node:test` because it is the runner a machine with node already has; the
 * kit takes whichever runner it is handed. A world is one situation the
 * workflow can be in, and adding one is how a new state gets proven.
 */
function scaffoldSuite(): string {
  return `import { describe, it } from "node:test";
import { conforms } from "${TESTKIT}";
import { runtime, workflow } from "./index.ts";

// Each world is a situation this workflow can be in. Give one a \`meanwhile\`
// for what the outside world does while the workflow waits.
conforms(workflow, {
  runner: { describe, it },
  runtime: () => runtime(),
  worlds: [{ name: "a piece of work arrives" }],
});
`;
}
