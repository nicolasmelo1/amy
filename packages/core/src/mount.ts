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
import { CommandRunner } from "./ports/CommandRunner.js";
import { EventLog } from "./ports/EventLog.js";
import { Queue } from "./ports/Queue.js";
import { Store } from "./ports/Store.js";

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

  for (const plugin of plugins) {
    const settings = configFor(plugin.name, plugin.configSchema, config[plugin.name], problems);
    if (settings === null) continue;

    const ctx = contextFor(settings, mounted, host);

    try {
      await plugin.register(registrarFor(plugin, mounted, problems), ctx);
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
): PluginContext {
  return {
    config,
    runner: host.runner,
    now: host.now,
    log: host.log,
    paths: host.paths,
    contributions: (collection) => mounted.contributions.get(collection) ?? new Map(),
    port: (kind) => mounted.ports.get(kind),
  };
}

function registrarFor(plugin: Plugin, mounted: Mounted, problems: string[]): Registry {
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
 * What a mounted host cannot give the workflow it was asked to drive.
 *
 * This is where the price of an open action name gets paid: at boot, naming
 * the action, rather than halfway through a ticket.
 */
export function unmetNeeds(mounted: Mounted, workflow: Workflow<never, never>): string[] {
  const unmet: string[] = [];

  for (const action of workflow.usesActions) {
    const spec = mounted.actions.get(action);
    if (!spec) {
      unmet.push(`action \`${action}\`: nothing defines it`);
      continue;
    }
    if (!mounted.ports.has(spec.port)) {
      unmet.push(`action \`${action}\`: needs the \`${spec.port}\` port, which nothing mounted`);
    }
  }

  for (const slice of workflow.usesObservers) {
    if (!mounted.observers.has(slice)) {
      unmet.push(`observation \`${slice}\`: nothing contributes it`);
    }
  }

  return unmet;
}
