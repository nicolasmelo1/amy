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
  trackerWritesFor,
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
  const mutablePortKinds = new WeakMap<object, "tracker" | "code-host">();

  for (const plugin of plugins) {
    const settings = configFor(plugin.name, plugin.configSchema, config[plugin.name], problems);
    if (settings === null) continue;

    const ctx = contextFor(settings, mounted, host, workflowFor, mutablePortKinds);

    try {
      await plugin.register(registrarFor(plugin, mounted, problems, ctx, workflowFor, mutablePortKinds), ctx);
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
  mutablePortKinds: WeakMap<object, "tracker" | "code-host">,
): PluginContext {
  const ctx: PluginContext = {
    config,
    runner: host.runner,
    now: host.now,
    log: host.log,
    paths: host.paths,
    contributions: (collection) => mounted.contributions.get(collection) ?? new Map(),
    // This remains deferred until a workflow registers. A workflow plugin can
    // retain this view while it registers; it must never retain the raw port.
    // Other plugins also compose independent contracts (for example the
    // feature-grooming seam); engines use `workflowPort` for selected actions.
    port: (kind) => narrowedPort(mounted.ports.get(kind), kind, () => workflowFor.get(ctx), mutablePortKinds),
    workflowPort: (kind) => narrowedPort(mounted.ports.get(kind), kind, () => mounted.workflow, mutablePortKinds),
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

function narrowedPort(
  port: object | undefined,
  kind: PortKind,
  workflowFor: () => Workflow<never, never> | undefined,
  mutablePortKinds: WeakMap<object, "tracker" | "code-host">,
): object | undefined {
  if (!port) return port;
  const scopedKind = mutablePortKind(port, kind, mutablePortKinds);
  if (!scopedKind) return port;
  const methods = scopedKind === "tracker" ? TRACKER_WRITE_FOR_METHOD : CODE_HOST_WRITE_FOR_METHOD;
  const capabilities = () => {
    const workflow = workflowFor();
    return scopedKind === "tracker"
      ? new Set(workflow?.trackerWrites ?? [])
      : new Set(workflow?.codeHostWrites ?? []);
  };

  const reads = scopedKind === "tracker" ? TRACKER_READ_METHODS : CODE_HOST_READ_METHODS;
  // Do not proxy the adapter itself: its prototype and own properties would
  // otherwise remain discoverable through reflection. The workflow gets a
  // blank object carrying only contract readers and the writers it claimed.
  const view = new Proxy(Object.create(null), {
    ownKeys() {
      return workflowFor() ? [] : Reflect.ownKeys(port);
    },
    getOwnPropertyDescriptor(_target, property) {
      if (workflowFor()) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(port, property);
      // Reflection is another way to retain a property before the workflow
      // declares itself. Never hand its raw value or accessor out through a
      // descriptor: a retained getter can otherwise disclose an adapter-owned
      // client after the workflow becomes attenuated.
      return deferredDescriptor(descriptor, workflowFor, port, property);
    },
    getPrototypeOf() {
      // A prototype is adapter-owned state too. In particular, handing it out
      // while a workflow is registering lets that workflow retain prototype
      // helpers or accessors after its declaration closes the port.
      return null;
    },
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      // Provider plugins may compose an independent seam before they register
      // a workflow. Resolve a callable when it is invoked rather than handing
      // out a bound adapter method: a workflow may cache it before registering
      // and must still become attenuated once it claims a workflow.
      if (!workflowFor()) {
        const initial = Reflect.get(port, property);
        // A workflow may retain an adapter-owned client or runner before it
        // declares its surface just as easily as it may retain a method. Keep
        // objects deferred too: provider composition remains live until this
        // context registers a workflow, but a retained internal object becomes
        // opaque when that declaration takes effect.
        if (typeof initial !== "function") return deferredPortValue(initial, workflowFor);
        return (...args: unknown[]) => Promise.resolve().then(() => {
          // Let a synchronous registration finish before deciding whether this
          // is a provider call or a workflow's retained callable. This keeps
          // provider composition live, while a workflow that declares itself
          // immediately after taking the callable cannot cause a write in the
          // registration window.
          const value = workflowFor()
            ? Reflect.get(view, property)
            : initial;
          if (typeof value !== "function") return value;
          return value.apply(workflowFor() ? undefined : port, args);
        });
      }
      const capability = methods[property];
      if (!reads.has(property) && !capability) return undefined;
      const value = Reflect.get(port, property);
      if (typeof value !== "function") return undefined;
      if (!capability || capabilities().has(capability)) {
        const bound = value.bind(port);
        // `acceptsAction` is an opt-in marker on a callable. Binding changes
        // its receiver but does not copy the one public dispatch marker. Do
        // not copy arbitrary symbols: those may point back into an adapter.
        const acceptsAction = Symbol.for("amykit.acceptsAction");
        const descriptor = Object.getOwnPropertyDescriptor(value, acceptsAction);
        if (descriptor) Object.defineProperty(bound, acceptsAction, descriptor);
        return bound;
      }
      return async (): Promise<never> => {
        throw new Error(`the workflow does not claim the ${scopedKind} write \`${capability}\` (${property})`);
      };
    },
  });
  // A provider can re-export this deferred view under a consumer-facing alias
  // before it registers its workflow. Record the contract on the view itself
  // so the alias keeps the mutable kind when another workflow asks for it.
  mutablePortKinds.set(view, scopedKind);
  return view;
}

function deferredPortValue(
  value: unknown,
  workflowFor: () => Workflow<never, never> | undefined,
  receiver?: object,
): unknown {
  if (typeof value === "function") {
    return (...args: unknown[]) => {
      if (workflowFor()) return undefined;
      return value.apply(receiver, args);
    };
  }
  if (!value || typeof value !== "object") return value;
  return new Proxy(Object.create(null), {
    get(_target, property) {
      return workflowFor() ? undefined : deferredPortValue(Reflect.get(value, property), workflowFor, value);
    },
    ownKeys() {
      return workflowFor() ? [] : Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(_target, property) {
      return workflowFor()
        ? undefined
        : deferredDescriptor(Reflect.getOwnPropertyDescriptor(value, property), workflowFor, value, property);
    },
    getPrototypeOf() {
      return null;
    },
  });
}

/** Rebuild reflection descriptors so neither values nor accessors retain raw adapter state. */
function deferredDescriptor(
  descriptor: PropertyDescriptor | undefined,
  workflowFor: () => Workflow<never, never> | undefined,
  receiver: object,
  property: PropertyKey,
): PropertyDescriptor | undefined {
  if (!descriptor) return undefined;
  // The proxy target owns no properties, so its reported descriptors must be
  // configurable regardless of the adapter's implementation detail.
  if ("value" in descriptor) {
    return {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      writable: false,
      value: deferredPortValue(descriptor.value, workflowFor, receiver),
    };
  }
  return {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get: () => deferredPortValue(Reflect.get(receiver, property, receiver), workflowFor, receiver),
  };
}

/**
 * Ports are intentionally named by their consumer, so one mutable adapter may
 * also be mounted as a read seam such as `feature`. Preserve the mutable
 * contract recorded when the adapter was first mounted.
 */
function mutablePortKind(
  port: object,
  requested: PortKind,
  mutablePortKinds: WeakMap<object, "tracker" | "code-host">,
): "tracker" | "code-host" | undefined {
  if (requested === "tracker" || requested === "code-host") return requested;
  return mutablePortKinds.get(port);
}

function registrarFor(
  plugin: Plugin,
  mounted: Mounted,
  problems: string[],
  ctx: PluginContext,
  workflowFor: WeakMap<PluginContext, Workflow<never, never>>,
  mutablePortKinds: WeakMap<object, "tracker" | "code-host">,
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
      const mutableKind = mutablePortKindForPort(kind, impl, mutablePortKinds);
      if (mutableKind) mutablePortKinds.set(impl, mutableKind);
    },
    action: (name, spec, port) => {
      if (mounted.actions.has(name) && !mounted.ports.has(spec.port)) {
        problems.push(`${plugin.name}: the action \`${name}\` is already claimed`);
        return;
      }
      mounted.actions.set(name, spec);
      if (!mounted.ports.has(spec.port)) {
        mounted.ports.set(spec.port, port);
      }
      // An action can bind a mutable method to an existing consumer-named
      // alias. Classify that already-mounted adapter as well as a new one.
      const adapter = mounted.ports.get(spec.port);
      const kind = mutablePortKindForAction(spec, adapter, mutablePortKinds);
      if (kind && adapter) mutablePortKinds.set(adapter, kind);
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
 * An action may introduce its port, including an alias such as `feature`.
 * Classify a declared mutable method at that point so the engine's workflow
 * view cannot receive the newly mounted adapter whole.
 */
function mutablePortKindForAction(
  spec: ActionSpec,
  port?: object,
  mutablePortKinds?: WeakMap<object, "tracker" | "code-host">,
): "tracker" | "code-host" | undefined {
  const known = port && mutablePortKinds?.get(port);
  if (known) return known;
  if (spec.port === "tracker" || TRACKER_WRITE_FOR_METHOD[spec.method]) return "tracker";
  if (spec.port === "code-host" || CODE_HOST_WRITE_FOR_METHOD[spec.method]) return "code-host";
  if (port && isCodeHostPort(port)) return "code-host";
  // A consumer-named tracker alias can bind a new mutator before the core
  // table learns its method name. The binding makes this a mutable boundary;
  // fail closed instead of returning that adapter whole to a workflow.
  if (isTrackerActionAlias(port)) return "tracker";
  if (port && isTrackerPort(port)) return "tracker";
  return undefined;
}

function mutablePortKindForPort(
  kind: PortKind,
  port: object,
  mutablePortKinds: WeakMap<object, "tracker" | "code-host">,
): "tracker" | "code-host" | undefined {
  return mutablePortKind(port, kind, mutablePortKinds)
    ?? (isCodeHostPort(port) ? "code-host" : undefined)
    ?? (isTrackerPort(port) ? "tracker" : undefined);
}

function isCodeHostPort(port: object): boolean {
  return [...CODE_HOST_READ_METHODS, ...Object.keys(CODE_HOST_WRITE_FOR_METHOD)]
    .some((method) => typeof Reflect.get(port, method) === "function");
}

function isTrackerPort(port: object): boolean {
  return Object.keys(TRACKER_WRITE_FOR_METHOD)
    .some((method) => typeof Reflect.get(port, method) === "function");
}

/** An action binding turns an otherwise ambiguous `get` alias into a mutable boundary. */
function isTrackerActionAlias(port: object | undefined): boolean {
  return Boolean(port && typeof Reflect.get(port, "get") === "function");
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
    unmet.push(...unclaimedWrites(mounted, workflow, actions));
    unmet.push(...misboundWrites(mounted, actions));
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
function unclaimedWrites(mounted: Mounted, workflow: Workflow<never, never>, actions: Readonly<Record<string, unknown>>): string[] {
  return [
    ...unclaimed(
      "tracker",
      workflow.trackerWrites ?? [],
      TRACKER_WRITE_CAPABILITIES,
      actions,
      (action, implementation) => writeFor(mounted, "tracker", action, implementation, trackerWritesFor, TRACKER_WRITE_FOR_METHOD, mounted.actions.has(action)),
      "trackerWrites",
    ),
    ...unclaimed(
      "code-host",
      workflow.codeHostWrites ?? [],
      CODE_HOST_WRITE_CAPABILITIES,
      actions,
      (action, implementation) => writeFor(mounted, "code-host", action, implementation, (name) => {
        const capability = codeHostWriteFor(name);
        return capability ? [capability] : [];
      }, CODE_HOST_WRITE_FOR_METHOD, mounted.actions.has(action)),
      "codeHostWrites",
    ),
  ];
}

function unclaimed(
  port: string,
  declarations: readonly string[],
  supported: readonly string[],
  actions: Readonly<Record<string, unknown>>,
  capabilitiesFor: (action: string, implementation: unknown) => readonly string[],
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
  for (const [action, implementation] of Object.entries(actions)) {
    for (const capability of capabilitiesFor(action, implementation)) {
      if (claimed.has(capability)) continue;
      unmet.push(
        `action \`${action}\` writes the ${port} (\`${capability}\`), ` +
          `but the workflow does not claim that capability — add \`${capability}\` to its \`${field}\``,
      );
    }
  }
  return unmet;
}

/** A bound action names its write by its actual port method; handlers use the core catalogue. */
function writeFor(
  mounted: Mounted,
  port: PortKind,
  action: string,
  implementation: unknown,
  coreWritesFor: (action: string) => readonly string[],
  writeForMethod: Readonly<Record<string, string>>,
  pluginBound: boolean,
): readonly string[] {
  if (isPortBinding(implementation)) {
    if (!pluginBound) return [];
    // A port binding is executable as written, even when its action name is a
    // core name. The method table, not that name or a consumer-facing alias,
    // identifies the declaration it needs.
    if (bindingPortKind(mounted, implementation) !== port) return [];
    const capability = writeForMethod[implementation.method];
    return capability ? [capability] : [];
  }
  return CORE_ACTIONS[action]?.port === port ? coreWritesFor(action) : [];
}

/** Resolve a binding by its mounted target, not by a method another port owns. */
function bindingPortKind(mounted: Mounted, binding: ActionSpec): "tracker" | "code-host" | undefined {
  if (binding.port === "tracker" || binding.port === "code-host") return binding.port;
  const adapter = mounted.ports.get(binding.port);
  if (!adapter) return undefined;
  for (const kind of ["tracker", "code-host"] as const) {
    if (mounted.ports.get(kind) === adapter) return kind;
  }
  if (TRACKER_WRITE_FOR_METHOD[binding.method]) return "tracker";
  if (CODE_HOST_WRITE_FOR_METHOD[binding.method]) return "code-host";
  return undefined;
}

/** A known writer from one mutable contract may not be wired to the other. */
function misboundWrites(mounted: Mounted, actions: Readonly<Record<string, unknown>>): string[] {
  const problems: string[] = [];
  for (const [action, implementation] of Object.entries(actions)) {
    if (!isPortBinding(implementation) || !mounted.actions.has(action)) continue;
    const kind = bindingPortKind(mounted, implementation);
    const opposite = kind === "tracker"
      ? CODE_HOST_WRITE_FOR_METHOD[implementation.method]
      : kind === "code-host"
        ? TRACKER_WRITE_FOR_METHOD[implementation.method]
        : undefined;
    if (opposite) {
      problems.push(
        `action \`${action}\` binds the ${kind} port to \`${implementation.method}\`, ` +
          `a write only the ${kind === "tracker" ? "code-host" : "tracker"} contract defines`,
      );
    }
  }
  return problems;
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
