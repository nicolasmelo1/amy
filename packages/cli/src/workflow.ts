import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { actionsOf, applyPlan, Plugin, PluginContext, Registry, Workflow, WorkflowRuntime, WorkRecord } from "@amykit/core";
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
 */
export function localWorkflow(home: string, spec: string): string | undefined {
  if (!isLocalName(spec)) return undefined;

  const entry = path.join(workflowsDirectory(home), spec, "index.js");
  return fs.existsSync(entry) ? pathToFileURL(entry).href : undefined;
}

/** Makes an import specifier prefer this machine's workflow directory. */
export function workflowSpecifier(home: string, spec: string): string {
  return localWorkflow(home, spec) ?? spec;
}

/** Writes the smallest complete workflow: a package that runs before editing. */
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
    main: "./index.js",
    files: ["index.js"],
  }, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(directory, "index.js"), scaffold(name), "utf-8");
  writeWorkflowProfile(home, name, name, config);
  return directory;
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
    return `${spec}: could not be imported — ${message(error)}`;
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

function recordFor(workflow: Workflow, runtime: WorkflowRuntime, now: () => Date): WorkRecord | string {
  try { return runtime.newRecord("workflow-check", now()); }
  catch (error) { return `${workflow.name}: newRecord failed — ${message(error)}`; }
}

async function moveOnce(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, now: () => Date): Promise<{ kind: "advance"; record: WorkRecord } | { kind: "settled" } | { kind: "wait" } | string> {
  try {
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    const missing = actionsOf(plan).find((action) => !runtime.handlers()[action.type]);
    if (missing) return `${workflow.name}: plan emits \`${missing.type}\`, but no runtime handler answers it`;
    if (plan.kind === "settled") return { kind: "settled" };
    if (plan.kind === "wait") return waitingProblem(workflow, runtime, record);
    if (plan.kind === "act") return `${workflow.name}: did not settle; it kept acting in \`${record.state}\``;
    if (!workflow.states.includes(plan.to)) return `${workflow.name}: advances to undeclared state \`${plan.to}\``;
    const moved = runtime.apply(applyPlan(record, plan, now()), plan, {}, observation, now());
    return moved.state === plan.to ? { kind: "advance", record: moved } : `${workflow.name}: one look did not make the transition it claimed`;
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

function scaffold(name: string): string {
  return `// This workflow belongs to this machine. Edit the states and the two halves below.\n// \`amy workflow check ${name}\` drives this file before it drives real work.\n\nconst workflow = {\n  name: ${JSON.stringify(name)},\n  states: ["received", "done"],\n  waitingStates: [],\n  initialState: "received",\n  terminalStates: ["done"],\n  usesActions: [],\n  usesObservers: [],\n  plan: (record) =>\n    record.state === "received"\n      ? { kind: "advance", to: "done", effects: [], why: "the work was received" }\n      : { kind: "settled", why: "the workflow is complete" },\n};\n\nconst runtime = {\n  policy: {},\n  found: async () => ["example"],\n  newRecord: (id, now) => ({ id, state: "received", updatedAt: now.toISOString(), attempts: {}, history: [] }),\n  observe: async () => ({}),\n  handlers: () => ({}),\n  apply: (record) => record,\n};\n\nexport const plugin = {\n  name: ${JSON.stringify(`workflow-${name}`)},\n  version: "0.1.0",\n  register(registry) {\n    registry.workflow(workflow);\n    registry.contribute("workflow-runtime", workflow.name, runtime);\n  },\n};\n`;
}
