import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withDiagramBeside, type Plugin } from "@amykit/core";
import { workspaceDirectories } from "../lib/repo.js";
import type {
  AddedAction,
  Contribution,
  PackageFact,
  Setting,
  WorkflowShape,
} from "../lib/facts.js";

interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  private?: boolean;
  main?: string;
  dependencies?: Record<string, string>;
}

/** A setting as a plugin declares it to the host. */
interface SettingField {
  type: string;
  required?: boolean;
  default?: unknown;
  example?: unknown;
  description?: string;
}

/** What a workflow runtime contributes: the actions it declares, by name. */
interface ContributedRuntime {
  actions?: object;
}

/** The marker `deferred()` in the core puts on an implementation the host builds. */
const DEFERRED = Symbol.for("amykit.deferred");

/** The registry handed to a plugin here, which only writes down what it is asked. */
interface NoteRegistry {
  queue(): void;
  store(): void;
  engine(): void;
  workflow(workflow: { name: string }): void;
  port(kind: string): void;
  action(name: string, spec: { port: string; method: string }): void;
  contribute(collection: string, name: string, impl: ContributedRuntime): void;
}

interface StandInContext {
  config: Record<string, unknown>;
  runner: { run(): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string }> };
  now(): Date;
  log: { append(): void; read(): never[] };
  paths: { workspace: string; state: string };
  contributions(): Map<string, unknown>;
  port(): object;
  checkouts(): { git: object; layout: object };
  workflow(): undefined;
}

/** The part of a plugin introspection reads; the rest is the host's business. */
interface IntrospectedPlugin {
  configSchema?: Record<string, SettingField>;
  register(registry: NoteRegistry, context: StandInContext): unknown;
}

interface PackageModule {
  plugin?: IntrospectedPlugin;
  [name: string]: unknown;
}

/** The exported machine of a workflow package, as far as its shape goes. */
interface Machine {
  name: string;
  plan: (...args: never[]) => unknown;
  states: readonly string[];
  waitingStates: readonly string[];
  terminalStates: readonly string[];
  initialState: string;
}

interface Registered {
  mounts: string[];
  contributes: Contribution[];
  addsActions: AddedAction[];
  observes: string[];
  mountsEngine: boolean;
  mountsWorkflow: string | null;
}

/** What loading a package could tell, by how far loading it got. */
type Introspection =
  | { kind: "unbuilt" | "unloadable"; problem: string }
  | { kind: "cli" }
  | { kind: "library"; exports: string[] }
  | (Registered & {
      kind: "plugin" | "workflow";
      exports: string[];
      settings: Setting[];
      registerProblem?: string;
      workflow?: WorkflowShape;
    });

/**
 * A throwaway directory the introspected plugins may write into.
 *
 * A plugin that keeps files creates its directory in `register`, and pointing
 * that at the workspace would leave the generator's litter in the repository
 * it is documenting. Made once, removed once, and never anywhere a checkout
 * can see it.
 */
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "amy-docs-"));

/**
 * What a plugin registers, found by registering it.
 *
 * Nothing here reads a manifest a maintainer has to keep in step. Each plugin
 * is handed a registry that only writes down what it is asked for, and a
 * context holding the settings its own schema declares. That means the
 * reference tables say what the code does rather than what somebody last
 * remembered to write, which is the whole point of generating them.
 */
export async function packageFacts(): Promise<PackageFact[]> {
  const found: PackageFact[] = [];

  try {
    for (const { group, dir, entry } of workspaceDirectories()) {
      const manifest: PackageManifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const environment = environmentOf(dir);

      found.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? "",
        private: manifest.private === true,
        group,
        directory: `${group}/${entry}`,
        dependencies: Object.keys(manifest.dependencies ?? {}).sort(),
        amyDependencies: Object.keys(manifest.dependencies ?? {})
          .filter((name) => name.startsWith("@amykit/"))
          .sort(),
        environment,
        ...(await introspect(dir, manifest, environment)),
      });
    }

    return found;
  } finally {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  }
}

/**
 * The environment variables a package reads, found by reading it.
 *
 * A hand-kept list of these would be the first thing to go out of date, and
 * the symptom is the worst kind: a credential nobody documented, discovered
 * when a mount refuses at three in the morning. It is also what makes
 * introspection possible below — a plugin that throws without a key is given
 * a placeholder for exactly the keys it names.
 */
function environmentOf(dir: string): string[] {
  const src = path.join(dir, "src");
  if (!fs.existsSync(src)) return [];

  const names = new Set<string>();

  for (const file of sourceFiles(src)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\["([A-Z][A-Z0-9_]*)"\])/g)) {
      const name = match[1] ?? match[2];
      if (name) names.add(name);
    }
  }

  return [...names].sort();
}

function sourceFiles(from: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(from).sort()) {
    const full = path.join(from, entry);
    if (fs.statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) found.push(full);
  }

  return found;
}

/** Loads the built package and asks it what it is. */
async function introspect(
  dir: string,
  manifest: PackageManifest,
  environment: string[],
): Promise<Introspection> {
  const main = manifest.main ?? "./dist/index.js";
  const entry = path.join(dir, main);

  if (!fs.existsSync(entry)) {
    return { kind: "unbuilt", problem: `${main} is not built — run \`npm run build\`` };
  }

  // The CLI's entry point *is* the command: importing it parses argv and
  // exits. Nothing in it is introspected, so it is never loaded.
  if (manifest.name === "@amykit/cli") return { kind: "cli" };

  let module: PackageModule;
  try {
    module = await import(pathToFileURL(entry).href);
  } catch (error) {
    return { kind: "unloadable", problem: message(error) };
  }

  if (!module.plugin) return { kind: "library", exports: Object.keys(module).sort() };

  // What makes a package a workflow is the machine it exports, never its name.
  // `@amykit/workflow-feature-grooming` is named for the workflow it serves and
  // exports no machine at all — it mounts ports — and calling it a workflow
  // told every reader to name it under `workflows:`, where boot refuses it.
  // Shaped by the diagram beside it, the way the host's loader shapes it: a
  // workflow drawn in `workflow.mmd` declares no states of its own.
  const plugin = withDiagramBeside(module.plugin as unknown as Plugin, entry) as unknown as IntrospectedPlugin;
  const runtimes = new Map<string, ContributedRuntime>();
  const machines: unknown[] = [];
  const registered = await registers(plugin, environment, runtimes, machines);
  const shape = workflowShape(module, runtimes, machines, calledIn(plugin));

  return {
    kind: shape.workflow ? "workflow" : "plugin",
    exports: Object.keys(module).sort(),
    settings: settingsOf(plugin),
    ...registered,
    ...shape,
  };
}

/** One row per setting, from the schema the plugin declares to the host. */
function settingsOf(plugin: IntrospectedPlugin): Setting[] {
  return Object.entries(plugin.configSchema ?? {})
    .map(([name, field]) => ({
      name,
      type: field.type,
      required: field.required === true,
      default: field.default,
      description: field.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Registers the plugin against a registry that only takes notes.
 *
 * `register` is called and `ready` is not. `register` is where a plugin says
 * what it is; `ready` is where it judges a configuration against the rest of
 * a real host, and there is no real host here.
 */
async function registers(
  plugin: IntrospectedPlugin,
  environment: string[],
  runtimes = new Map<string, ContributedRuntime>(),
  machines: unknown[] = [],
): Promise<Registered & { registerProblem?: string }> {
  const seen: Registered = {
    mounts: [],
    contributes: [],
    addsActions: [],
    observes: [],
    mountsEngine: false,
    mountsWorkflow: null,
  };

  const registry: NoteRegistry = {
    queue: () => seen.mounts.push("queue"),
    store: () => seen.mounts.push("store"),
    engine: () => {
      seen.mountsEngine = true;
    },
    workflow: (workflow) => {
      seen.mountsWorkflow = workflow.name;
      machines.push(workflow);
    },
    port: (kind) => seen.mounts.push(kind),
    action: (name, spec) => {
      seen.addsActions.push({ name, port: spec.port, method: spec.method });
      if (!seen.mounts.includes(spec.port)) seen.mounts.push(spec.port);
    },
    contribute: (collection, name, impl) => {
      seen.contributes.push({ collection, name });
      if (collection === "workflow-runtime") runtimes.set(name, impl);
    },
  };

  const context = contextFor(plugin);
  const restore = placeholders([...environment, ...referencedEnvironment(context.config)]);
  try {
    await plugin.register(registry, context);
    // A deferred runtime is built the way the host builds one: once
    // registration is over, against the same stand-in context.
    for (const [name, runtime] of runtimes) {
      const build = (runtime as Record<symbol, unknown>)[DEFERRED];
      if (typeof build === "function") runtimes.set(name, build() as ContributedRuntime);
    }
  } catch (error) {
    // A plugin that will not register against a stand-in host is reported as
    // such rather than dropped: a reference page missing a plugin looks
    // exactly like a plugin that does not exist.
    return { ...sorted(seen), registerProblem: message(error) };
  } finally {
    restore();
  }

  return sorted(seen);
}

/**
 * A stand-in value for every environment variable the package reads.
 *
 * An adapter that refuses to mount without a credential is right to, and it
 * still has to be able to say what it mounts. Only names the package itself
 * reads are set, only for the length of one `register`, and never over a
 * value the caller already had — so running the generator on a machine with
 * a real key in the environment neither uses it nor loses it.
 */
function placeholders(names: string[]): () => void {
  const set = names.filter((name) => process.env[name] === undefined);
  for (const name of set) process.env[name] = "docs-generator-placeholder";

  return () => {
    for (const name of set) delete process.env[name];
  };
}

/**
 * The variables a stand-in setting points at, as `env:<NAME>`.
 *
 * A plugin whose credential is named in its config rather than in its
 * source still needs one to describe itself, and only for as long as the
 * variables the package reads directly.
 */
function referencedEnvironment(config: Record<string, unknown>): string[] {
  return Object.values(config)
    .map((value) => (typeof value === "string" ? /^env:([A-Z][A-Z0-9_]*)$/.exec(value)?.[1] : undefined))
    .filter((name): name is string => Boolean(name));
}

function sorted(seen: Registered): Registered {
  return {
    mounts: [...seen.mounts].sort(),
    contributes: [...seen.contributes].sort((a, b) =>
      `${a.collection}${a.name}`.localeCompare(`${b.collection}${b.name}`),
    ),
    addsActions: [...seen.addsActions].sort((a, b) => a.name.localeCompare(b.name)),
    observes: [...seen.observes].sort(),
    mountsEngine: seen.mountsEngine,
    mountsWorkflow: seen.mountsWorkflow,
  };
}

/**
 * The context a plugin sees while it is being asked what it is.
 *
 * Every setting takes its declared default, then its declared example, or a
 * value of the declared type where there is neither, so a required field does not stop a plugin describing
 * itself. Nothing here touches the disk or the network, and the environment
 * is filled with obvious placeholders so an adapter that refuses to mount
 * without a credential can still say what it mounts.
 */
function contextFor(plugin: IntrospectedPlugin): StandInContext {
  const config: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(plugin.configSchema ?? {})) {
    config[name] = field.default ?? field.example ?? sample(field.type);
  }

  return {
    config,
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date(0),
    log: { append() {}, read: () => [] },
    paths: { workspace: SCRATCH, state: SCRATCH },
    contributions: () => new Map(),
    // Every method a mounted port could offer, so a workflow that requires
    // one it only offers optionally still registers here and says what it is.
    port: () => new Proxy({}, { get: (_target, key) => (key === "then" ? undefined : () => undefined) }),
    // The layout the plugin's own settings describe, and a `Git` nothing
    // here will ever ask to run — leased to a lane, it is the same `Git`.
    checkouts: () => ({
      git: { leasedTo(): object { return this; } },
      layout: { workspaceRoot: SCRATCH, checkouts: {}, defaultBranch: config.defaultBranch ?? "main", baseBranch: config.baseBranch },
    }),
    workflow: () => undefined,
  };
}

function sample(type: string): unknown {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string[]":
      return [];
    default:
      return {};
  }
}

/**
 * A workflow package also exports its machine, which is where its shape is.
 *
 * The actions are not on the machine: they are the keys of the runtime it
 * contributed, where each one is declared beside what runs it.
 */
function workflowShape(
  module: PackageModule,
  runtimes: Map<string, ContributedRuntime>,
  registered: readonly unknown[] = [],
  called = false,
): { workflow?: WorkflowShape } {
  // The machine it registered, which is the one its diagram shaped; an
  // exported one for a package that registers none against a stand-in.
  const machine = registered.find(isMachine) ?? Object.values(module).find(isMachine);

  if (!machine) return {};

  return {
    workflow: {
      name: machine.name,
      states: [...machine.states],
      waitingStates: [...machine.waitingStates],
      terminalStates: [...machine.terminalStates],
      initialState: machine.initialState,
      usesActions: actionsOf(runtimes.get(machine.name)),
      ...(called ? { called } : {}),
    },
  };
}

/**
 * Whether a workflow takes an input, read off the declaration the core keeps
 * for its callers: one that does is called from another workflow's state.
 */
function calledIn(plugin: IntrospectedPlugin): boolean {
  const callee = (plugin as unknown as Record<symbol, { declaration?: { input?: unknown } } | undefined>)[Symbol.for("@amykit/core/workflow-callee")];
  return callee?.declaration?.input !== undefined;
}

function isMachine(value: unknown): value is Machine {
  return (
    value !== null &&
    typeof value === "object" &&
    "plan" in value &&
    typeof value.plan === "function" &&
    "states" in value &&
    Array.isArray(value.states)
  );
}

/** The actions a contributed runtime declares, sorted; none when it cannot say. */
function actionsOf(runtime: ContributedRuntime | undefined): string[] {
  try {
    return Object.keys(runtime?.actions ?? {}).sort();
  } catch {
    return [];
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
