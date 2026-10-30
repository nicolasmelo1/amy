import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Checkouts } from "./checkouts.js";
import { DIAGRAM_FILE, Diagram, readDiagram } from "./diagram.js";
import { ConfigOf, ConfigSchema } from "./config-schema.js";
import { deferred } from "./deferred.js";
import { Plugin, PluginContext, Registry, Workflow } from "./plugin.js";
import { WorkflowRuntime } from "./runtime.js";
import { Action, Plan, WorkRecord } from "./work.js";
import { WORKFLOW_RUNTIME } from "./runtime.js";

const PORT_NEED = Symbol("workflow-port-need");

export interface PortNeed<T, Optional extends boolean = false> {
  readonly [PORT_NEED]: { readonly type: T; readonly optional: Optional };
}

/** Declares a mounted port a workflow requires. */
export function port<T>(): PortNeed<T> {
  return Object.freeze({ [PORT_NEED]: { optional: false } }) as PortNeed<T>;
}

/** Declares a mounted port a workflow can use when present. */
export function optional<T>(): PortNeed<T, true> {
  return Object.freeze({ [PORT_NEED]: { optional: true } }) as PortNeed<T, true>;
}

type Needs = Readonly<Record<string, PortNeed<unknown, boolean>>>;
type PortsOf<N extends Needs> = {
  readonly [K in keyof N]: N[K] extends PortNeed<infer T, true> ? T | undefined
    : N[K] extends PortNeed<infer T, false> ? T
      : never;
};

export type WorkflowRuntimeParts<R extends WorkRecord, O> = Omit<WorkflowRuntime<R, O>, "policy" | "newRecord">;

type Claims<S extends ConfigSchema, P extends object> =
  | readonly string[]
  | ((args: { readonly config: ConfigOf<S>; readonly policy: P }) => readonly string[]);

export interface WorkflowPlugin<R extends WorkRecord = WorkRecord, O = unknown, P = unknown> extends Plugin {
  /** Throws, naming why, when the workflow has no states: no diagram was read and none were declared. */
  readonly workflow: Workflow<O, P>;
  newRecord(workId: string, now: Date): R;
}

// Registered rather than private: a workflow may be defined against another
// copy of the core than the host's, and the host still has to hand it its
// diagram.
const DRAW = Symbol.for("@amykit/core/workflow-draw");

/** A declaration that can be handed the diagram the host found beside it. */
interface Drawable {
  readonly [DRAW]: (diagram: Diagram | Error) => Plugin;
}

/** The states, the initial one, and where work waits and ends, from the diagram or the declaration. */
interface Shape {
  readonly states: readonly string[];
  readonly initial: string;
  readonly waiting: readonly string[];
  readonly terminal: readonly string[];
  readonly diagram?: Diagram;
}

/** The four typed constructors a pure workflow plan returns. */
export function planning<State extends string, Effect extends Action>() {
  return {
    act: (why: string, ...effects: Effect[]): Plan => ({ kind: "act", effects, why }),
    advance: (to: State, why: string, ...effects: Effect[]): Plan => ({ kind: "advance", to, effects, why }),
    wait: (retryAfterMs: number, why: string, ...effects: Effect[]): Plan => ({ kind: "wait", retryAfterMs, why, effects }),
    settled: (why: string): Plan => ({ kind: "settled", why }),
  };
}

const NOT_WRITTEN = /^the decision for `([^`]+)` is not written yet$/;

/**
 * A decision nobody has written yet, for a state the diagram draws.
 *
 * It mounts, and on a look it settles the record saying so rather than
 * guessing a move, so a workflow imported from a diagram runs on its first
 * boot and still says what is left to write.
 */
export function notWritten(): (record: WorkRecord) => Plan {
  return (record) => ({ kind: "settled", why: `the decision for \`${record.state}\` is not written yet` });
}

/** The state whose decision is a `notWritten()` stub, read off the plan it returned. */
export function notWrittenIn(plan: Plan): string | undefined {
  return plan.kind === "settled" ? NOT_WRITTEN.exec(plan.why)?.[1] : undefined;
}

export function defineWorkflow<
  const S extends ConfigSchema,
  const States extends readonly [string, ...string[]],
  P extends object,
  const N extends Needs,
  R extends WorkRecord,
  O,
>(declaration: {
  readonly name: string;
  readonly pluginName?: string;
  /**
   * Required only when no diagram lies beside the workflow. A workflow with a
   * `workflow.mmd` declares none of these: the host reads them from the file,
   * and declaring them as well is refused at boot.
   */
  readonly states?: States;
  readonly waiting?: readonly States[number][];
  readonly terminal?: readonly States[number][];
  readonly configSchema: S;
  readonly policy: P;
  readonly needs: N;
  readonly trackerWrites?: Claims<S, P>;
  readonly codeHostWrites?: Claims<S, P>;
  runtimePolicy?(args: { readonly ports: PortsOf<N>; readonly config: ConfigOf<S>; readonly policy: P }): P;
  plan(record: R, observation: O, policy: P): Plan;
  record(workId: string): Omit<R, keyof WorkRecord>;
  runtime(args: {
    readonly ports: PortsOf<N>;
    readonly config: ConfigOf<S>;
    readonly policy: P;
    readonly checkouts: Checkouts;
    readonly ctx: PluginContext<ConfigOf<S>>;
  }): WorkflowRuntimeParts<R, O>;
}): WorkflowPlugin<R, O, P> {
  return drawnWith(declaration, undefined);
}

type Declaration<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O> =
  Parameters<typeof defineWorkflow<S, readonly [string, ...string[]], P, N, R, O>>[0];

/** The plugin for a declaration, shaped by the diagram the host read beside it, or by its own lists. */
function drawnWith<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O>(
  declaration: Declaration<S, P, N, R, O>,
  drawn: Diagram | Error | undefined,
): WorkflowPlugin<R, O, P> {
  const shape = shapeOf(declaration, drawn);
  const refused = (): never => {
    throw new Error(shape as string);
  };
  const newRecord = (workId: string, now: Date): R => {
    if (typeof shape === "string") refused();
    return {
      ...declaration.record(workId),
      id: workId,
      state: (shape as Shape).initial,
      updatedAt: now.toISOString(),
      attempts: {},
      history: [],
    } as unknown as R;
  };

  const plugin = {
    name: declaration.pluginName ?? `workflow-${declaration.name}`,
    configSchema: declaration.configSchema,
    newRecord,
    [DRAW]: (diagram: Diagram | Error) => drawnWith(declaration, diagram),
    register(registry: Registry, untyped: PluginContext) {
      if (typeof shape === "string") refused();
      const ctx = untyped as PluginContext<ConfigOf<S>>;
      const policy = policyFor(declaration.name, declaration.policy, ctx.config.policy);
      const workflow = workflowFor(declaration, shape as Shape, policy, ctx.config);
      registry.workflow(workflow as Workflow<never, never>);
      registry.contribute(WORKFLOW_RUNTIME, workflow.name, deferred(() => {
        const ports = portsFor(declaration.name, declaration.needs, ctx) as PortsOf<N>;
        const runtimePolicy = declaration.runtimePolicy?.({ ports, config: ctx.config, policy }) ?? policy;
        const runtime = declaration.runtime({
          ports,
          config: ctx.config,
          policy: runtimePolicy,
          checkouts: ctx.checkouts(),
          ctx,
        });
        return completeRuntime(runtime, runtimePolicy, newRecord);
      }));
    },
  } satisfies Omit<WorkflowPlugin<R, O, P>, "workflow"> & Drawable;
  // A workflow with no states cannot be read until something gives it some,
  // so the unmounted declaration says why when it is asked, not at import.
  if (typeof shape === "string") Object.defineProperty(plugin, "workflow", { get: refused, enumerable: false });
  else Object.defineProperty(plugin, "workflow", { value: workflowFor(declaration, shape, declaration.policy), enumerable: true });
  return plugin as unknown as WorkflowPlugin<R, O, P>;
}

/**
 * Where the states come from, or why there are none.
 *
 * The diagram is the shape when one lies beside the workflow. Declaring the
 * states as well is the same fact said twice, and a diagram amy cannot read
 * is refused with the line it stopped at.
 */
function shapeOf(
  declaration: { readonly name: string; readonly states?: readonly string[]; readonly waiting?: readonly string[]; readonly terminal?: readonly string[] },
  drawn: Diagram | Error | undefined,
): Shape | string {
  const workflow = `the ${declaration.name} workflow`;
  if (drawn instanceof Error) return `${workflow} has a diagram amy cannot read — ${drawn.message}`;
  const declared = (["states", "waiting", "terminal"] as const).filter((field) => declaration[field] !== undefined);
  if (drawn) {
    if (declared.length > 0) {
      return `${workflow} draws its states in ${DIAGRAM_FILE} and declares ${declared.map((field) => `\`${field}\``).join(", ")} as well; delete them, the diagram already says it`;
    }
    // Waiting on the owner is still waiting, as far as the engine is concerned.
    const waiting = drawn.states.filter((state) => drawn.waiting.includes(state) || drawn.attention.includes(state));
    return { states: drawn.states, initial: drawn.initial, waiting, terminal: drawn.terminal, diagram: drawn };
  }
  const [initial] = declaration.states ?? [];
  if (initial === undefined || declaration.terminal === undefined) {
    return `${workflow} has no ${DIAGRAM_FILE} beside it and declares no \`states\` and \`terminal\`: draw the diagram, or declare them`;
  }
  return { states: declaration.states!, initial, waiting: declaration.waiting ?? [], terminal: declaration.terminal };
}

/**
 * The diagram beside a workflow's entry, found the way the entry itself is.
 *
 * A workflow is a directory: one under the workflows directory holds its
 * diagram beside its entry, and a package holds it at its root, which is the
 * nearest directory above the entry with a manifest. Nothing names the file.
 */
export function diagramBeside(entry: string | URL): { readonly path: string; readonly text: string } | undefined {
  const file = entry instanceof URL || entry.startsWith("file:") ? fileURLToPath(entry) : entry;
  for (const directory of [path.dirname(file), packageRoot(path.dirname(file))]) {
    if (directory === undefined) continue;
    const candidate = path.join(directory, DIAGRAM_FILE);
    if (fs.existsSync(candidate)) return { path: candidate, text: fs.readFileSync(candidate, "utf-8") };
  }
  return undefined;
}

function packageRoot(from: string): string | undefined {
  for (let directory = from; ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, "package.json"))) return directory;
    if (path.dirname(directory) === directory) return undefined;
  }
}

/**
 * The plugin, shaped by a diagram's text.
 *
 * A declaration takes its states from it. A plugin that registers its
 * workflow by hand already says its states, so a diagram beside it is the
 * same fact twice, and it is refused when it mounts.
 */
export function withDiagram<T extends Plugin>(plugin: T, text: string, source: string = DIAGRAM_FILE): T {
  let diagram: Diagram | Error;
  try {
    diagram = readDiagram(text, source);
  } catch (error) {
    diagram = error instanceof Error ? error : new Error(String(error));
  }
  if (DRAW in plugin) return (plugin as T & Drawable)[DRAW](diagram) as T;
  return {
    name: plugin.name,
    ...(plugin.configSchema ? { configSchema: plugin.configSchema } : {}),
    register() {
      throw new Error(`${plugin.name} registers its workflow by hand and has ${source} beside it; a workflow says its states once — move it onto \`defineWorkflow\`, or delete the diagram`);
    },
  } as unknown as T;
}

/** The plugin, shaped by the diagram beside its entry when there is one, and unchanged when there is none. */
export function withDiagramBeside<T extends Plugin>(plugin: T, entry: string | URL): T {
  const found = diagramBeside(entry);
  return found ? withDiagram(plugin, found.text, found.path) : plugin;
}

/**
 * Completes a declaration's runtime with the fields the core owns.
 *
 * Members are delegated, not spread: a class-built runtime keeps its methods
 * on the prototype, and a spread drops them while the mount still succeeds.
 */
function completeRuntime<R extends WorkRecord, O, P>(
  parts: WorkflowRuntimeParts<R, O>,
  policy: P,
  newRecord: (workId: string, now: Date) => R,
): WorkflowRuntime<R, O> {
  return {
    policy,
    ...(parts.progress ? { progress: parts.progress } : {}),
    found: () => parts.found(),
    observe: (record) => parts.observe(record),
    actions: parts.actions,
    apply: (record, plan, outcomes, observation, now, moved) =>
      parts.apply(record, plan, outcomes, observation, now, moved),
    newRecord,
  };
}

function workflowFor<S extends ConfigSchema, P extends object, R extends WorkRecord, O>(
  declaration: {
    readonly name: string;
    readonly trackerWrites?: Claims<S, P>;
    readonly codeHostWrites?: Claims<S, P>;
    plan(record: R, observation: O, policy: P): Plan;
  },
  shape: Shape,
  policy: P,
  config?: ConfigOf<S>,
): Workflow<O, P> {
  // A claim written as a function is read only where a configuration exists:
  // this module's exported object has none, so a callback that reads a
  // required setting cannot throw at import. The mount rebuilds the workflow
  // with its own validated config, and the unmounted declaration claims
  // nothing — a mount given it refuses loudly rather than widening the claim.
  const claims = (value: Claims<S, P> | undefined): readonly string[] => {
    if (typeof value !== "function") return value ?? [];
    if (config === undefined) return [];
    return value({ config, policy });
  };
  return {
    name: declaration.name,
    states: shape.states,
    waitingStates: shape.waiting,
    initialState: shape.initial,
    terminalStates: shape.terminal,
    ...(shape.diagram ? { diagram: shape.diagram } : {}),
    trackerWrites: claims(declaration.trackerWrites),
    codeHostWrites: claims(declaration.codeHostWrites),
    plan: (record, observation, chosen) => declaration.plan(record as R, observation, chosen),
  };
}

function portsFor(workflow: string, needs: Needs, ctx: PluginContext): Record<string, unknown> {
  return Object.fromEntries(Object.entries(needs).map(([kind, need]) => {
    const mounted = ctx.port(kind);
    if (!mounted && !(need as PortNeed<unknown, boolean>)[PORT_NEED].optional) {
      throw new Error(`the ${workflow} workflow needs the \`${kind}\` port, and nothing mounted it`);
    }
    return [kind, mounted];
  }));
}

function policyFor<P extends object>(workflow: string, defaults: P, configured: unknown): P {
  const overrides = configured ?? {};
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error(`${workflow} policy must be a mapping`);
  }
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`${workflow} policy.${key} is not declared`);
  }
  return { ...defaults, ...overrides };
}
