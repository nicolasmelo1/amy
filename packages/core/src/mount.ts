import { ActionSpec, CORE_ACTIONS, PortKind } from "./actions.js";
import { ConfigSchema, validateConfig } from "./config-schema.js";
import {
  Engine,
  HostPaths,
  ObservationSource,
  Plugin,
  PluginContext,
  Registry,
  Workflow,
} from "./plugin.js";
import { declaredActions, isPortBinding, unrunnable } from "./dispatch.js";
import { WORKFLOW_RUNTIME, WorkflowRuntime } from "./runtime.js";
import { CommandRunner } from "./ports/CommandRunner.js";
import { EventLog } from "./ports/EventLog.js";
import { Queue } from "./ports/Queue.js";
import { Store } from "./ports/Store.js";
import {
  CODE_HOST_WRITE_CAPABILITIES,
  CODE_HOST_WRITE_FOR_METHOD,
  codeHostWriteFor,
} from "./ports/CodeHost.js";
import {
  TRACKER_WRITE_CAPABILITIES,
  TRACKER_WRITE_FOR_METHOD,
  trackerWriteFor,
} from "./ports/Ticketing.js";

/** The few services the host lends every plugin. */
export interface HostServices {
  runner: CommandRunner;
  now: () => Date;
  log?: EventLog;
  paths: HostPaths;
}

export interface Mounted {
  queue?: Queue;
  store?: Store;
  engine?: Engine;
  workflow?: Workflow<never, never>;
  ports: Map<PortKind, object>;
  /** Core actions plus whatever plugins added. */
  actions: Map<string, ActionSpec>;
  observers: Map<string, ObservationSource>;
  /** Named collections several plugins may add to, keyed by collection. */
  contributions: Map<string, Map<string, object>>;
  plugins: { name: string; version: string }[];
}

export type MountOutcome =
  | { ok: true; mounted: Mounted }
  | { ok: false; problems: string[] };

/**
 * Assembles a set of plugins into one working host.
 *
 * Every refusal happens here, at boot, by name. The alternative is finding out
 * halfway through somebody's ticket that a setting was a typo, or that two
 * plugins both thought they were the tracker.
 */
export async function mount(
  plugins: readonly Plugin[],
  config: Readonly<Record<string, unknown>>,
  host: HostServices,
): Promise<MountOutcome> {
  const problems: string[] = [];
  const mounted: Mounted = {
    ports: new Map(),
    actions: new Map(Object.entries(CORE_ACTIONS)),
    observers: new Map(),
    contributions: new Map(),
    plugins: [],
  };

  const registered: { plugin: Plugin; ctx: PluginContext }[] = [];
  const workflowFor = new WeakMap<PluginContext, Workflow<never, never>>();

  for (const plugin of plugins) {
    const settings = configFor(plugin.name, plugin.configSchema, config[plugin.name], problems);
    if (settings === null) continue;

    const ctx = contextFor(settings, mounted, host, workflowFor);

    try {
      await plugin.register(registrarFor(plugin, mounted, problems, ctx, workflowFor), ctx);
    } catch (error) {
      // A plugin that cannot set itself up is a problem with a name, not an
      // unhandled throw that takes the whole boot down anonymously.
      problems.push(
        `${plugin.name}: failed to mount — ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    mounted.plugins.push({ name: plugin.name, version: plugin.version });
    registered.push({ plugin, ctx });
  }

  // A second pass, because a plugin that composes others can only judge its
  // own settings once those others have contributed themselves. Skipped when
  // something already went wrong, since a later complaint about a missing
  // contribution would just be an echo of the earlier refusal.
  if (problems.length === 0) {
    for (const { plugin, ctx } of registered) {
      if (!plugin.ready) continue;

      try {
        await plugin.ready(ctx);
      } catch (error) {
        problems.push(
          `${plugin.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, mounted };
}

function configFor(
  plugin: string,
  schema: ConfigSchema | undefined,
  given: unknown,
  problems: string[],
): Record<string, unknown> | null {
  if (!schema) {
    if (given !== undefined) {
      problems.push(`${plugin}: has no settings, but the config gives it some`);
      return null;
    }
    return {};
  }

  const result = validateConfig(plugin, schema, given);
  if (!result.ok) {
    problems.push(...result.problems);
    return null;
  }

  return result.config;
}

/**
 * The context one plugin sees.
 *
 * `contributions` and `port` read the mounted state when they are called, not
 * when the context is made, so a plugin that composes others is not at the
 * mercy of the order plugins were listed in.
 */
function contextFor(
  config: Record<string, unknown>,
  mounted: Mounted,
  host: HostServices,
  workflowFor: WeakMap<PluginContext, Workflow<never, never>>,
): PluginContext {
  const ctx: PluginContext = {
    config,
    runner: host.runner,
    now: host.now,
    log: host.log,
    paths: host.paths,
    contributions: (collection) => mounted.contributions.get(collection) ?? new Map(),
    port: (kind) => narrowedPort(mounted.ports.get(kind), kind, workflowFor.get(ctx)),
    workflowPort: (kind) => narrowedPort(mounted.ports.get(kind), kind, mounted.workflow),
    workflow: () => mounted.workflow,
  };
  return ctx;
}

/**
 * A workflow receives a private view of its mutable external ports. The mounted
 * port remains whole for adapters. A workflow's own context and an engine's
 * workflow dispatch view are attenuated before either can invoke an action.
 */
const TRACKER_READ_METHODS = new Set(["inProgress", "get", "comments", "hasReplyAfter"]);
const CODE_HOST_READ_METHODS = new Set([
  "findPullRequest",
  "reviewLoad",
  "reviewsRequestedOf",
  "changesRequestedOf",
  "pullRequest",
  "commitStatuses",
]);

function narrowedPort(port: object | undefined, kind: PortKind, workflow: Workflow<never, never> | undefined): object | undefined {
  if (!port || !workflow) return port;
  const capabilities = kind === "tracker"
    ? new Set(workflow.trackerWrites ?? [])
    : kind === "code-host"
      ? new Set(workflow.codeHostWrites ?? [])
      : undefined;
  const methods = kind === "tracker" ? TRACKER_WRITE_FOR_METHOD : kind === "code-host" ? CODE_HOST_WRITE_FOR_METHOD : undefined;
  if (!capabilities || !methods) return port;

  const reads = kind === "tracker" ? TRACKER_READ_METHODS : CODE_HOST_READ_METHODS;
  // Do not proxy the adapter itself: its prototype and own properties would
  // otherwise remain discoverable through reflection. The workflow gets a
  // blank object carrying only contract readers and the writers it claimed.
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      const capability = methods[property];
      if (!reads.has(property) && !capability) return undefined;
      const value = Reflect.get(port, property);
      if (typeof value !== "function") return undefined;
      if (!capability || capabilities.has(capability)) return value.bind(port);
      return async (): Promise<never> => {
        throw new Error(`the workflow does not claim the ${kind} write \`${capability}\` (${property})`);
      };
    },
  });
}

function registrarFor(
  plugin: Plugin,
  mounted: Mounted,
  problems: string[],
  ctx: PluginContext,
  workflowFor: WeakMap<PluginContext, Workflow<never, never>>,
): Registry {
  const claim = <T>(what: string, held: T | undefined, incoming: T): T => {
    if (held !== undefined) {
      problems.push(`${plugin.name}: ${what} is already mounted by another plugin`);
      return held;
    }
    return incoming;
  };

  return {
    queue: (impl) => {
      mounted.queue = claim("the queue", mounted.queue, impl);
      mounted.ports.set("queue", impl as object);
    },
    store: (impl) => {
      mounted.store = claim("the store", mounted.store, impl);
      mounted.ports.set("store", impl as object);
    },
    engine: (impl) => {
      mounted.engine = claim("the engine", mounted.engine, impl);
    },
    workflow: (impl) => {
      mounted.workflow = claim("a workflow", mounted.workflow, impl);
      if (mounted.workflow === impl) workflowFor.set(ctx, impl);
    },
    port: (kind, impl) => {
      if (mounted.ports.has(kind)) {
        problems.push(`${plugin.name}: the \`${kind}\` port is already mounted by another plugin`);
        return;
      }
      mounted.ports.set(kind, impl);
    },
    action: (name, spec, port) => {
      if (mounted.actions.has(name) && !mounted.ports.has(spec.port)) {
        problems.push(`${plugin.name}: the action \`${name}\` is already claimed`);
        return;
      }
      mounted.actions.set(name, spec);
      if (!mounted.ports.has(spec.port)) mounted.ports.set(spec.port, port);
    },
    contribute: (collection, name, impl) => {
      const existing = mounted.contributions.get(collection) ?? new Map<string, object>();
      if (existing.has(name)) {
        problems.push(`${plugin.name}: \`${name}\` is already in the \`${collection}\` collection`);
        return;
      }
      existing.set(name, impl);
      mounted.contributions.set(collection, existing);
    },
    observer: (slice, source) => {
      if (mounted.observers.has(slice)) {
        problems.push(`${plugin.name}: the \`${slice}\` observation is already contributed`);
        return;
      }
      mounted.observers.set(slice, source);
    },
  };
}

/**
 * The runtime the mounted workflow contributed, looked up by the workflow's
 * own name the way an engine looks it up.
 */
export function mountedRuntime(
  mounted: Mounted,
  workflow: Workflow<never, never>,
): WorkflowRuntime | undefined {
  return mounted.contributions.get(WORKFLOW_RUNTIME)?.get(workflow.name) as
    | WorkflowRuntime
    | undefined;
}

/**
 * The actions a mounted workflow declares: its runtime's keys, or none when
 * the runtime is missing or cannot be read.
 */
export function mountedActions(mounted: Mounted, workflow: Workflow<never, never>): string[] {
  try {
    const runtime = mountedRuntime(mounted, workflow);
    return runtime?.actions ? declaredActions(runtime) : [];
  } catch {
    return [];
  }
}

/**
 * What a mounted host cannot give the workflow it was asked to drive.
 *
 * This is where the price of an open action name gets paid: at boot, naming
 * the action, rather than halfway through a ticket.
 */
export function unmetNeeds(mounted: Mounted, workflow: Workflow<never, never>): string[] {
  const unmet: string[] = [];
  const actions = declaredOn(mounted, workflow, unmet);

  if (actions !== null) {
    const port = (kind: PortKind): object | undefined => mounted.ports.get(kind);
    for (const [action, implementation] of Object.entries(actions)) {
      const problem = unrunnable(action, implementation, port) ?? catalogued(mounted, action, implementation);
      if (problem) unmet.push(problem);
    }
    unmet.push(...unclaimedWrites(workflow, Object.keys(actions)));
  }

  for (const slice of workflow.usesObservers) {
    if (!mounted.observers.has(slice)) {
      unmet.push(`observation \`${slice}\`: nothing contributes it`);
    }
  }

  return unmet;
}

/**
 * The declaration rule: a workflow's claimed tracker writes are the only
 * surface its runtime may reach. The claim is written by hand, never derived,
 * so a declared tracker-mutating action it does not claim is refused at boot,
 * naming the action and the capability, before any tracker call log records
 * a write.
 */
function unclaimedWrites(workflow: Workflow<never, never>, actions: readonly string[]): string[] {
  return [
    ...unclaimed(
      "tracker",
      workflow.trackerWrites ?? [],
      TRACKER_WRITE_CAPABILITIES,
      actions,
      trackerWriteFor,
      "trackerWrites",
    ),
    ...unclaimed(
      "code-host",
      workflow.codeHostWrites ?? [],
      CODE_HOST_WRITE_CAPABILITIES,
      actions,
      codeHostWriteFor,
      "codeHostWrites",
    ),
  ];
}

function unclaimed(
  port: string,
  declarations: readonly string[],
  supported: readonly string[],
  actions: readonly string[],
  capabilityFor: (action: string) => string | undefined,
  field: string,
): string[] {
  const unmet: string[] = [];
  const claimed = new Set(declarations);
  for (const capability of claimed) {
    if (supported.includes(capability)) continue;
    unmet.push(
      `the workflow claims the ${port} write \`${capability}\`, which is not one a mounted ${port} could honour — ${describeCapabilities(supported)}`,
    );
  }
  for (const action of actions) {
    const capability = capabilityFor(action);
    if (capability === undefined || claimed.has(capability)) continue;
    unmet.push(
      `action \`${action}\` writes the ${port} (\`${capability}\`), ` +
        `but the workflow does not claim that capability — add \`${capability}\` to its \`${field}\``,
    );
  }
  return unmet;
}

function describeCapabilities(capabilities: readonly string[]): string {
  const names = capabilities.map((capability) => `\`${capability}\``);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/**
 * The runtime's action map, or `null` with the reason pushed when there is
 * none to read.
 *
 * A package still written against the old contract is named with its fix,
 * because a boot that refused it any other way would read as a missing port.
 */
function declaredOn(
  mounted: Mounted,
  workflow: Workflow<never, never>,
  unmet: string[],
): Readonly<Record<string, unknown>> | null {
  if (Object.hasOwn(workflow, "usesActions")) {
    unmet.push(
      `the workflow \`${workflow.name}\` still declares \`usesActions\`, which is now the keys of its runtime's \`actions\` — delete it and key each action there, beside what runs it`,
    );
  }

  const runtime = mountedRuntime(mounted, workflow);
  if (!runtime) {
    unmet.push(
      `the workflow \`${workflow.name}\` contributed no runtime to \`${WORKFLOW_RUNTIME}\`, so nothing can run its actions`,
    );
    return null;
  }

  let actions: unknown;
  try {
    actions = runtime.actions;
  } catch (error) {
    unmet.push(
      `the workflow \`${workflow.name}\`: its actions could not be read — ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (actions === null || typeof actions !== "object") {
    const legacy = typeof (runtime as { handlers?: unknown }).handlers === "function";
    unmet.push(
      legacy
        ? `the workflow \`${workflow.name}\` still has \`handlers()\`, which is now \`actions\`: one map whose keys are the actions it emits and whose values run them`
        : `the workflow \`${workflow.name}\` declares no \`actions\` on its runtime`,
    );
    return null;
  }
  return unmet.length > 0 ? null : (actions as Readonly<Record<string, unknown>>);
}

/**
 * Whether the catalogue agrees with how an action is implemented.
 *
 * A handler runs an action the catalogue names, because the catalogue is
 * what tells the budget which actions spend an agent and the tracker check
 * which ones write. A port and a method names its own port, so it may run an
 * action nobody catalogued — but not one the catalogue sends elsewhere.
 */
function catalogued(mounted: Mounted, action: string, implementation: unknown): string | null {
  const spec = mounted.actions.get(action);
  if (isPortBinding(implementation)) {
    if (!spec || spec.port === implementation.port) return null;
    return `action \`${action}\` is wired to the \`${implementation.port}\` port, but the catalogue runs it on \`${spec.port}\``;
  }
  if (!spec) return `action \`${action}\`: nothing defines it`;
  if (!mounted.ports.has(spec.port)) {
    return `action \`${action}\`: needs the \`${spec.port}\` port, which nothing mounted`;
  }
  return null;
}
