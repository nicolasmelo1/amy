import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyPlan, BRANCH_SETTINGS, Builds, cameFrom, CommandRunner, connects, DIAGRAM_FILE, DrawnTransition, lendCheckouts, isDeferred, isPortBinding, markState, movedBy, notWrittenIn, Plugin, PluginContext, readDiagram, Registry, undeclaredIn, Workflow, WorkflowRuntime, WorkRecord } from "@amykit/core";
import { AmyConfig, writeWorkflowProfile } from "./config.js";
import { drawn } from "./drawn.js";

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
export function writeWorkflow(home: string, name: string, config: AmyConfig, from?: string): string {
  if (!isLocalName(name)) {
    throw new Error("a workflow name is one directory name: letters, numbers, hyphens and underscores");
  }
  // Read before anything is written, so a diagram amy cannot read is refused
  // with its line and leaves no half-made directory behind.
  const drawn = from === undefined
    ? readDiagram(scaffoldDiagram(), `${name}/${DIAGRAM_FILE}`)
    : readDiagram(fs.readFileSync(from, "utf-8"), from);

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
    // The diagram is the workflow's shape: a package without it cannot mount.
    files: ["dist", DIAGRAM_FILE],
    scripts: { build: "tsc", typecheck: "tsc --noEmit", test: "node --test", prepack: "npm run build" },
    // A dependency, not a dev one: the published `dist/index.d.ts` imports
    // its types, as every shipped workflow package does.
    dependencies: { "@amykit/core": `^${groupVersion()}` },
    devDependencies: { [TESTKIT]: `^${groupVersion()}`, typescript: TYPESCRIPT },
  }, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify(SCAFFOLD_TSCONFIG, null, 2) + "\n", "utf-8");
  fs.writeFileSync(path.join(directory, DIAGRAM_FILE), drawn.text, "utf-8");
  fs.writeFileSync(path.join(directory, "index.ts"), from === undefined ? scaffold(name) : scaffoldFromDiagram(name, drawn.states), "utf-8");
  fs.writeFileSync(path.join(directory, "index.test.ts"), scaffoldSuiteFromDiagram(), "utf-8");
  linkCore(directory);
  writeGuardrails(directory);
  writeWorkflowProfile(home, name, name, config);
  return directory;
}

/** Makes the declaration runnable before the workflow installs its package dependencies. */
function linkCore(directory: string): void {
  const entry = fileURLToPath(import.meta.resolve("@amykit/core"));
  const core = path.resolve(path.dirname(entry), "..");
  const scope = path.join(directory, "node_modules", "@amykit");
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(core, path.join(scope, "core"), process.platform === "win32" ? "junction" : "dir");
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
  return [...(await inspectWorkflow(home, name, config, resolve)).problems];
}

/** What a check found: what is wrong, and what is only not written or not walked yet. */
export interface WorkflowCheck {
  readonly problems: readonly string[];
  /** States whose decision is still a `notWritten()` stub. */
  readonly stubs: readonly string[];
  /** Arrows the diagram draws that the walkthrough never took. */
  readonly drawnNotWalked: readonly DrawnTransition[];
}

/**
 * Drives a workflow's lifecycle against its stub world, holding every move
 * to its diagram when it has one, and says what is left to write.
 *
 * A move the diagram does not draw is a problem, naming both ends. A
 * decision that is still a stub and an arrow nothing walked are the to-do
 * list of a workflow being written, not a failure of one.
 */
export async function inspectWorkflow(
  home: string,
  name: string,
  config: AmyConfig,
  resolve: (spec: string) => string = (spec) => workflowSpecifier(home, spec),
): Promise<WorkflowCheck> {
  const profile = config.workflows[name];
  if (!profile) return { problems: [`there is no \`${name}\` workflow in the config`], stubs: [], drawnNotWalked: [] };

  const registered = await registeredWorkflow(home, homeRelative(home, profile.workflow), resolve);
  if (typeof registered === "string") return { problems: [registered], stubs: [], drawnNotWalked: [] };
  return drive(registered);
}

/**
 * A configured workflow's diagram, as text that renders anywhere Mermaid
 * does, with one state marked when a piece of work is given.
 */
export async function exportWorkflow(
  home: string,
  name: string,
  config: AmyConfig,
  options: { readonly state?: string; readonly resolve?: (spec: string) => string } = {},
): Promise<string> {
  const profile = config.workflows[name];
  if (!profile) throw new Error(`there is no \`${name}\` workflow in the config`);
  const diagram = await shapeOf(home, homeRelative(home, profile.workflow), options.resolve ?? ((spec) => workflowSpecifier(home, spec)));
  if (!diagram) throw new Error(`${name} has no ${DIAGRAM_FILE}: its states are declared in its code, so there is no diagram to export`);
  return options.state === undefined ? diagram.text : markState(diagram, options.state);
}

/**
 * The diagram a configured workflow was bound to, read the cheapest way that
 * says it: a declaration carries its workflow unregistered, so nothing reads
 * a configuration only the mount validates. A plugin that registers its
 * workflow by hand is registered to ask.
 */
async function shapeOf(home: string, spec: string, resolve: (spec: string) => string): Promise<Workflow["diagram"]> {
  const plugin = await importedPlugin(spec, resolve);
  if (typeof plugin === "string") throw new Error(plugin);
  const declared = (plugin as { workflow?: Workflow }).workflow;
  if (declared) return declared.diagram;
  const registered = await registration(home, spec, resolve);
  if (typeof registered === "string") throw new Error(registered);
  return registered.workflow.diagram;
}

/** A configured path is relative to amy's home, as the mount resolves it, not to wherever the command runs. */
function homeRelative(home: string, spec: string): string {
  return spec.startsWith(".") ? path.resolve(home, spec) : spec;
}

interface RegisteredWorkflow {
  workflow: Workflow;
  runtime: WorkflowRuntime;
  now: () => Date;
}

async function registeredWorkflow(home: string, spec: string, resolve: (spec: string) => string): Promise<RegisteredWorkflow | string> {
  const registered = await registration(home, spec, resolve);
  if (typeof registered === "string") return registered;
  const { workflow, contributions, builds, problems, now } = registered;

  builds.buildAll();
  if (problems.length > 0) return problems.join("; ");

  const runtime = contributions.get("workflow-runtime")?.get(workflow.name) as WorkflowRuntime | undefined;
  return runtime ? { workflow, runtime, now } : `${workflow.name}: contributed no runtime, so nothing here knows how to run its actions`;
}

interface Registration {
  workflow: Workflow;
  contributions: Map<string, Map<string, object>>;
  builds: Builds;
  problems: string[];
  now: () => Date;
}

/**
 * The workflow a plugin registers, with nothing deferred built yet.
 *
 * Enough to read its shape: building its runtime would ask for the ports it
 * needs, and only a mount has them.
 */
async function registration(home: string, spec: string, resolve: (spec: string) => string): Promise<Registration | string> {
  const plugin = await importedPlugin(spec, resolve);
  if (typeof plugin === "string") return plugin;

  let workflow: Workflow | undefined;
  const contributions = new Map<string, Map<string, object>>();
  // Deferred contributions are built the way the mount builds them: once
  // registration is over, each once, a dependency on demand, a circle refused.
  const problems: string[] = [];
  const builds = new Builds(problems);
  const registry = recordingRegistry(plugin.name, (value) => { workflow = value; }, contributions, builds);
  const now = () => new Date("2026-01-01T00:00:00.000Z");
  try {
    await plugin.register(registry, context(home, now, contributions, builds, () => workflow));
  } catch (error) {
    return `${spec}: failed to register — ${message(error)}`;
  }
  return workflow ? { workflow, contributions, builds, problems, now } : `${spec}: registered no workflow`;
}

async function importedPlugin(spec: string, resolve: (spec: string) => string): Promise<Plugin | string> {
  try {
    const specifier = resolve(spec);
    const loaded = (await import(specifier)) as { plugin?: Plugin };
    return loaded.plugin ? drawn(loaded.plugin, specifier) : `${spec}: imported, but exports no \`plugin\``;
  } catch (error) {
    const unbuilt = (error as { code?: unknown }).code === "ERR_UNKNOWN_FILE_EXTENSION"
      ? "; this Node cannot run TypeScript unbuilt, which takes 22.18 or later"
      : "";
    return `${spec}: could not be imported — ${message(error)}${unbuilt}`;
  }
}

function recordingRegistry(
  plugin: string,
  setWorkflow: (workflow: Workflow) => void,
  contributions: Map<string, Map<string, object>>,
  builds: Builds,
): Registry {
  return {
    queue: () => undefined, store: () => undefined, engine: () => undefined,
    workflow: setWorkflow, port: () => undefined, action: () => undefined,
    contribute: (collection, name, value) => {
      const values = contributions.get(collection) ?? new Map<string, object>();
      values.set(name, value);
      contributions.set(collection, values);
      if (isDeferred(value)) builds.defer(value, plugin, `\`${name}\` in \`${collection}\``, (built) => values.set(name, built));
    },
  };
}

function context(
  home: string,
  now: () => Date,
  contributions: Map<string, Map<string, object>>,
  builds: Builds,
  workflow: () => Workflow | undefined,
): PluginContext {
  const runner: CommandRunner = { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) };
  return {
    config: {}, runner, now,
    paths: { workspace: home, checkouts: {}, state: home },
    contributions: (collection) => builds.collection(contributions.get(collection)),
    port: () => undefined,
    checkouts: () => lendCheckouts(runner, { workspaceRoot: home, defaultBranch: BRANCH_SETTINGS.defaultBranch.default }),
    workflow: () => workflow() as Workflow<never, never> | undefined,
  };
}

async function drive({ workflow, runtime, now }: RegisteredWorkflow): Promise<WorkflowCheck> {
  const unimplemented = unimplementedActions(workflow, runtime);
  if (unimplemented.length > 0) return { problems: unimplemented, stubs: [], drawnNotWalked: [] };
  const created = recordFor(workflow, runtime, now);
  if (typeof created === "string") return { problems: [created], stubs: [], drawnNotWalked: [] };
  let record = created;
  const reached = new Set<string>();
  const walked = new Set<string>();
  let stopped = false;
  const problems = record.state === workflow.initialState ? [] : [`${workflow.name}: newRecord starts at \`${record.state}\`, not \`${workflow.initialState}\``];

  for (let move = 0; move < 32 && problems.length === 0; move += 1) {
    reached.add(record.state);
    const next = await moveOnce(workflow, runtime, record, now);
    if (typeof next === "string") { problems.push(next); break; }
    if (next.kind === "stub") { stopped = true; break; }
    if (next.kind === "settled" || next.kind === "wait") break;
    walked.add(`${record.state}\u0000${next.record.state}`);
    record = next.record;
  }
  const stubs = await stubsIn(workflow, runtime, created);
  return {
    // A walk that stopped at a decision nobody has written yet says nothing
    // about where the finished workflow ends: the stubs are the to-do list.
    problems: stopped ? problems : [...problems, ...completionProblems(workflow, record, reached)],
    stubs,
    drawnNotWalked: (workflow.diagram?.transitions ?? []).filter((edge) => !walked.has(`${edge.from}\u0000${edge.to}`)),
  };
}

/** Every drawn state whose decision is still a stub, asked one state at a time. */
async function stubsIn(workflow: Workflow, runtime: WorkflowRuntime, first: WorkRecord): Promise<string[]> {
  const stubs: string[] = [];
  for (const state of workflow.diagram?.states ?? []) {
    try {
      const record = { ...first, state };
      if (notWrittenIn(workflow.plan(record, await runtime.observe(record), runtime.policy)) === state) stubs.push(state);
    } catch {
      // A decision that cannot be asked out of turn is written; it is the
      // walk's to judge, not this list's.
    }
  }
  return stubs;
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

async function moveOnce(workflow: Workflow, runtime: WorkflowRuntime, record: WorkRecord, now: () => Date): Promise<{ kind: "advance"; record: WorkRecord } | { kind: "settled" } | { kind: "stub" } | { kind: "wait" } | string> {
  try {
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    const [missing] = undeclaredIn(runtime, plan);
    if (missing) return `${workflow.name}: plan emits \`${missing}\`, which its runtime never declared in \`actions\``;
    if (plan.kind === "settled") return notWrittenIn(plan) === record.state ? { kind: "stub" } : { kind: "settled" };
    if (plan.kind === "wait") return waitingProblem(workflow, runtime, record);
    if (plan.kind === "act") return `${workflow.name}: did not settle; it kept acting in \`${record.state}\``;
    if (!workflow.states.includes(plan.to)) return `${workflow.name}: advances to undeclared state \`${plan.to}\``;
    const diagram = workflow.diagram;
    if (diagram && !connects(diagram, record.state, plan.to, cameFrom(record.history, record.state))) {
      return `${workflow.name}: \`${record.state}\` moves to \`${plan.to}\`, and ${DIAGRAM_FILE} draws no arrow from \`${record.state}\` to \`${plan.to}\``;
    }
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
  return `// This workflow belongs to this machine. Edit workflow.mmd and the pieces below.
// \`amy workflow check ${name}\` drives this file before it drives real work,
// and \`npm test\` runs the machine's own suite over it. Node runs it as it is;
// \`npm run build\` compiles it for publishing.
import { act, advance, defineWorkflow, settled, type ConfigSchema, type Plan, type WorkRecord, type WorkflowRuntime } from "@amykit/core";

export const decide: Record<string, (record: WorkRecord) => Plan> = {
  received: () => advance("done", "the work was received"),
  done: () => settled("the workflow is complete"),
};
export const discover = async () => ["example"];
export const observe = async (_record: WorkRecord) => ({});
export const actions = {};
export function remember(record: WorkRecord): WorkRecord { return record; }

export const plugin = defineWorkflow({
  name: ${JSON.stringify(name)},
  configSchema: {} satisfies ConfigSchema,
  policy: {},
  needs: {},
  decide,
  record: () => ({}),
  discover,
  observe: (_scope, record) => observe(record),
  actions,
  remember: (_scope, record) => remember(record),
});

// The suite builds a fresh runtime and uses the core-owned record constructor.
export function runtime(newRecord = plugin.newRecord): WorkflowRuntime {
  return { found: discover, observe, actions, apply: remember, policy: {}, newRecord };
}
`;
}

function scaffoldDiagram(): string {
  return `stateDiagram-v2
    [*] --> received
    received --> done: the work was received
    done --> [*]
`;
}

/**
 * The suite every workflow needs and nobody writes, from its first commit.
 *
 * `node:test` because it is the runner a machine with node already has; the
 * kit takes whichever runner it is handed. A world is one situation the
 * workflow can be in, and adding one is how a new state gets proven.
 */
/**
 * A workflow whose shape is somebody's diagram, copied in beside it.
 *
 * It declares no states: the host reads them from `workflow.mmd`. Every
 * decision is a `notWritten()` stub, so it mounts as it is, settles rather
 * than guesses a move, and `amy workflow check` lists what is left to write.
 */
function scaffoldFromDiagram(name: string, states: readonly string[]): string {
  const decisions = states.map((state) => `  ${JSON.stringify(state)}: notWritten(),`).join("\n");
  return `// This workflow's shape is workflow.mmd beside this file: the states, where
// work starts, waits and ends. Write one decision per state below; each is a
// stub until then. \`amy workflow check ${name}\` lists what is left to write.
import { defineWorkflow, notWritten, type ConfigSchema, type Plan, type WorkRecord, type WorkflowRuntime } from "@amykit/core";

// One decision per state the diagram draws: where this piece of work goes next.
const decide: Record<string, (record: WorkRecord) => Plan> = {
${decisions}
};

export const discover = async () => ["example"];
export const observe = async (_record: WorkRecord) => ({});
export const actions = {};
export function remember(record: WorkRecord): WorkRecord { return record; }

export const plugin = defineWorkflow({
  name: ${JSON.stringify(name)},
  configSchema: {} satisfies ConfigSchema,
  policy: {},
  needs: {},
  decide,
  record: () => ({}),
  discover,
  observe: (_scope, record) => observe(record),
  // Every action a decision may emit, keyed by name, and what runs it: a
  // handler, or { port, method } for a mounted port the host calls.
  actions,
  // Called as (record, plan, outcomes, observation, now, moved). \`record\`
  // has already moved: read where it came from in \`moved.from\`.
  remember: (_scope, record) => remember(record),
});

export function runtime(newRecord = plugin.newRecord): WorkflowRuntime {
  return { found: discover, observe, actions, apply: remember, policy: {}, newRecord };
}
`;
}

/** The suite for a workflow drawn as a diagram, bound to it the way amy mounts it. */
function scaffoldSuiteFromDiagram(): string {
  return `import { describe, it } from "node:test";
import { withDiagramBeside } from "@amykit/core";
import { conforms } from "${TESTKIT}";
import { plugin, runtime } from "./index.ts";

// The workflow as amy mounts it: its states read from workflow.mmd beside it.
// Red until every decision is written; each finding is one left to write.
const drawn = withDiagramBeside(plugin, import.meta.url);

conforms(drawn.workflow, {
  runner: { describe, it },
  runtime: () => runtime(drawn.newRecord),
  worlds: [{ name: "a piece of work arrives" }],
});
`;
}
