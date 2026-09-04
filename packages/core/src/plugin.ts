import { ActionSpec, PortKind } from "./actions.js";
import { CommandRunner } from "./ports/CommandRunner.js";
import { EventLog } from "./ports/EventLog.js";
import { ConfigSchema } from "./config-schema.js";
import { Plan, WorkRecord } from "./work.js";
import { Queue } from "./ports/Queue.js";
import { Store } from "./ports/Store.js";

/**
 * A workflow: the order in which actions happen.
 *
 * It does not define actions, it composes the ones the core ships. `plan` is
 * pure, which is what lets a whole lifecycle be driven in a test with no I/O.
 *
 * Generic over the observation and the policy, so a workflow keeps full type
 * safety over its own domain while the core stays ignorant of it.
 */
export interface Workflow<Observation = unknown, Policy = unknown> {
  readonly name: string;
  readonly states: readonly string[];
  readonly waitingStates: readonly string[];
  readonly initialState: string;
  readonly terminalStates: readonly string[];
  /**
   * Declared as data so the loader can refuse a mount where an action has no
   * port behind it, and so the capability surface can be measured without
   * reading the logic.
   */
  readonly usesActions: readonly string[];
  readonly usesObservers: readonly string[];
  plan(record: WorkRecord, observation: Observation, policy: Policy): Plan;
}

/** Advances work. Serial by default, but replaceable like everything else. */
export interface Engine {
  /** Finds work that is not on the queue yet, and returns what it added. */
  discover(): Promise<string[]>;
  /** Advances one item by one move. */
  tick(): Promise<unknown>;
}

/** Contributes one named slice of the observation a workflow reads. */
export interface ObservationSource {
  observe(record: WorkRecord): Promise<unknown>;
}

export interface HostPaths {
  /** Where the checkouts a workflow works in live. */
  readonly workspace: string;
  /** Where the host keeps its own state. */
  readonly state: string;
}

/**
 * What the host lends a plugin at mount.
 *
 * A plugin gets its own settings and the few services every plugin would
 * otherwise reimplement, and it gets a *live* view of what other plugins
 * registered. Live matters: a plugin that composes others cannot see
 * contributions made after it, so it reads them when it is used rather than
 * when it is mounted.
 */
export interface PluginContext {
  readonly config: Record<string, unknown>;
  readonly runner: CommandRunner;
  readonly now: () => Date;
  readonly log?: EventLog;
  readonly paths: HostPaths;
  /** Everything contributed to a named collection, read when asked. */
  contributions(collection: string): ReadonlyMap<string, object>;
  /** A mounted port, read when asked. */
  port(kind: PortKind): object | undefined;
  /**
   * The mounted workflow, read when asked.
   *
   * Live for the same reason the two above are: an engine is mounted by a
   * plugin that may be listed before the workflow's, and mounting order
   * should not be something an operator has to get right.
   */
  workflow(): Workflow<never, never> | undefined;
}

export interface Registry {
  queue(impl: Queue): void;
  store(impl: Store): void;
  engine(impl: Engine): void;
  workflow(impl: Workflow<never, never>): void;
  /** Mounts a port. Mounting the same kind twice fails loudly. */
  port(kind: PortKind, impl: object): void;
  /**
   * Registers an action the core does not ship, together with the port that
   * runs it. The pair is inseparable on purpose: an action nobody can execute
   * is a promise the machine cannot keep.
   */
  action(name: string, spec: ActionSpec, port: object): void;
  observer(slice: string, source: ObservationSource): void;
  /**
   * Adds to a named collection that some other plugin consumes.
   *
   * The core does not know what a collection means, only that several
   * plugins may add to one and something else will read it. It is how the
   * notification channels reach the fan-out without the core learning the
   * word "channel".
   */
  contribute(collection: string, name: string, impl: object): void;
}

export interface Plugin {
  readonly name: string;
  readonly version: string;
  /**
   * What this plugin's slice of the configuration looks like.
   *
   * Declared here so the host can refuse a typo at boot without knowing what
   * any of the settings mean.
   */
  readonly configSchema?: ConfigSchema;
  register(r: Registry, ctx: PluginContext): void | Promise<void>;
  /**
   * Checked once every plugin has registered, and only for a plugin whose
   * settings cannot be judged before then.
   *
   * A plugin that composes others is the case this exists for: it cannot tell
   * whether its configuration makes sense until the plugins it composes have
   * contributed themselves. Throwing here is a refusal at boot, named, which
   * is the same promise `register` makes.
   */
  ready?(ctx: PluginContext): void | Promise<void>;
}
