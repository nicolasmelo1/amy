import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Checkouts } from "./checkouts.js";
import { ActionSpec } from "./actions.js";
import { ActionDuties, actionPorts } from "./action-ports.js";
import { DIAGRAM_FILE, Diagram, readDiagram } from "./diagram.js";
import { ConfigOf, ConfigSchema } from "./config-schema.js";
import { deferred } from "./deferred.js";
import { Plugin, PluginContext, Registry, Workflow } from "./plugin.js";
import { WorkflowRuntime } from "./runtime.js";
import { Action, Moved, Plan, WorkRecord } from "./work.js";
import { ActionContext, ActionImplementation, FoundWork, ProgressPolicy } from "./runtime.js";
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
export type PortsOf<N extends Needs> = {
  readonly [K in keyof N]: N[K] extends PortNeed<infer T, true> ? T | undefined
    : N[K] extends PortNeed<infer T, false> ? T
      : never;
};

export type WorkflowRuntimeParts<R extends WorkRecord, O> = Omit<WorkflowRuntime<R, O>, "policy" | "newRecord">;

/** Everything an individual runtime piece can use, built once at mount. */
export type WorkflowPieceContext<S extends ConfigSchema, P extends object, N extends Needs> = {
  readonly ports: PortsOf<N>;
  readonly config: ConfigOf<S>;
  readonly policy: P;
  readonly checkouts: Checkouts;
  readonly ctx: PluginContext<ConfigOf<S>>;
};

/** One state-sized pure decision. */
export type WorkflowDecision<R extends WorkRecord, O, P, State extends string = string, Effect extends Action = Action> =
  (record: R, observation: O, policy: P) => Plan<State, Effect>;

/** What an action is handed: the mounted context, with its ports and duties bound to the work. */
export type WorkflowActionScope<S extends ConfigSchema, P extends object, N extends Needs> = WorkflowPieceContext<S, P, N> & ActionDuties;

/** One action implementation, with the mounted workflow context in front. */
export type WorkflowAction<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O, Effect extends Action = Action> = (
  scope: WorkflowActionScope<S, P, N>,
  work: ActionContext<R, O>,
  effect: Effect,
) => Promise<void>;

// The declaration accepts domain-narrowed handlers from `workflowActions()`
// while contextual typing an inline handler against the core's open Action.
// Method parameters are bivariant; the runtime adapter still owns the cast at
// the one point where a keyed handler is dispatched from an open action.
type DeclarationAction<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O> = {
  run(scope: WorkflowActionScope<S, P, N>, work: ActionContext<R, O>, effect: Action): Promise<void>;
}["run"];

/**
 * Contextually types each handler from its action's own payload.
 *
 * A workflow supplies its effect union once, and each key then receives only
 * the matching member instead of the core's deliberately open Action shape.
 */
export function workflowActions<Effect extends Action>() {
  return <S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O>(
    actions: { readonly [Name in Effect["type"]]: WorkflowAction<S, P, N, R, O, Extract<Effect, { type: Name }>> },
  ) => actions;
}

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
export function act<Effect extends Action>(why: string, ...effects: Effect[]): Extract<Plan<string, Effect>, { kind: "act" }>;
export function act<Effect extends Action>(why: string, options: { attempt: false }, ...effects: Effect[]): Extract<Plan<string, Effect>, { kind: "act" }>;
export function act<Effect extends Action>(
  why: string,
  ...rest: (Effect | { attempt: false })[]
): Extract<Plan<string, Effect>, { kind: "act" }> {
  return actOf(why, rest);
}

function actOf<Effect extends Action>(
  why: string,
  [first, ...rest]: (Effect | { attempt: false })[],
): Extract<Plan<string, Effect>, { kind: "act" }> {
  const notATry = !!first && !("type" in first) && first.attempt === false;
  const effects = (notATry || first === undefined ? rest : [first, ...rest]) as Effect[];
  return { kind: "act", effects, why, ...(notATry ? { attempt: false } : {}) };
}

export function advance<State extends string, Effect extends Action>(to: State, why: string, ...effects: Effect[]): Plan<State, Effect> {
  return { kind: "advance", to, effects, why };
}

export function wait<Effect extends Action>(retryAfterMs: number, why: string, ...effects: Effect[]): Extract<Plan<string, Effect>, { kind: "wait" }> {
  return { kind: "wait", retryAfterMs, why, effects };
}

export function settled(why: string): Extract<Plan, { kind: "settled" }> {
  return { kind: "settled", why };
}

export function planning<State extends string, Effect extends Action>() {
  // Written out rather than named, so a workflow re-exporting it can name it.
  const typedAct: {
    (why: string, ...effects: Effect[]): Plan;
    (why: string, options: { attempt: false }, ...effects: Effect[]): Plan;
  } = (why: string, ...rest: (Effect | { attempt: false })[]): Plan => actOf(why, rest);
  return {
    act: typedAct,
    advance: (to: State, why: string, ...effects: Effect[]): Plan => advance(to, why, ...effects),
    wait: (retryAfterMs: number, why: string, ...effects: Effect[]): Plan => wait(retryAfterMs, why, ...effects),
    settled,
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

interface DeclarationBase<
  S extends ConfigSchema,
  States extends readonly [string, ...string[]],
  P extends object,
  N extends Needs,
  R extends WorkRecord,
> {
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
  record(workId: string): Omit<R, keyof WorkRecord>;
  /** Registers the supporting half of a workflow: ports, queues, actions or harnesses. */
  extend?(registry: Registry, ctx: PluginContext<ConfigOf<S>>): void | Promise<void>;
}

interface LegacyDeclaration<S extends ConfigSchema, States extends readonly [string, ...string[]], P extends object, N extends Needs, R extends WorkRecord, O>
  extends DeclarationBase<S, States, P, N, R> {
  plan(record: R, observation: O, policy: P): Plan;
  runtime(args: {
    readonly ports: PortsOf<N>;
    readonly config: ConfigOf<S>;
    readonly policy: P;
    readonly checkouts: Checkouts;
    readonly ctx: PluginContext<ConfigOf<S>>;
  }): WorkflowRuntimeParts<R, O>;
}

interface PiecesDeclaration<S extends ConfigSchema, States extends readonly [string, ...string[]], P extends object, N extends Needs, R extends WorkRecord, O>
  extends DeclarationBase<S, States, P, N, R> {
  readonly decide: Readonly<Record<string, WorkflowDecision<R, O, P, States[number]>>>;
  before?(record: R, observation: O, policy: P): Plan<States[number]> | undefined;
  after?(decision: Plan<States[number]>, record: R, observation: O, policy: P): Plan<States[number]>;
  discover?(scope: WorkflowPieceContext<S, P, N>): Promise<readonly (string | FoundWork)[]>;
  readonly progress?: ProgressPolicy | ((scope: WorkflowPieceContext<S, P, N>) => ProgressPolicy | undefined);
  observe(scope: WorkflowPieceContext<S, P, N>, record: R): Promise<O>;
  readonly actions:
    // `workflowActions()` narrows each handler's final argument to the action
    // named by its key. The declaration is the boundary that erases that
    // domain payload back to the core's open action vocabulary.
    | Readonly<Record<string, DeclarationAction<S, P, N, R, O> | ActionSpec>>
    | ((scope: WorkflowPieceContext<S, P, N>) => Readonly<Record<string, DeclarationAction<S, P, N, R, O> | ActionSpec>>);
  remember?(
    scope: WorkflowPieceContext<S, P, N>, record: R, outcomes: Record<string, unknown>, observation: O,
    moved: Moved | null, decision: Plan, now: Date,
  ): R;
  readonly plan?: never;
  readonly runtime?: never;
}

type WorkflowDeclaration<S extends ConfigSchema, States extends readonly [string, ...string[]], P extends object, N extends Needs, R extends WorkRecord, O> =
  | LegacyDeclaration<S, States, P, N, R, O>
  | PiecesDeclaration<S, States, P, N, R, O>;

export function defineWorkflow<
  const S extends ConfigSchema,
  const States extends readonly [string, ...string[]],
  P extends object,
  const N extends Needs,
  R extends WorkRecord,
  O,
>(declaration: WorkflowDeclaration<S, States, P, N, R, O>): WorkflowPlugin<R, O, P> {
  return drawnWith(declaration, undefined);
}

type Declaration<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O> =
  WorkflowDeclaration<S, readonly [string, ...string[]], P, N, R, O>;

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
      looks: {},
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
      declarationMode(declaration);
      if ("decide" in declaration) decisionsFit(declaration.name, (shape as Shape).states, declaration.decide);
      const registerWorkflow = () => {
        const workflow = workflowFor(declaration, shape as Shape, policy, ctx.config);
        registry.workflow(workflow as Workflow<never, never>);
        registry.contribute(WORKFLOW_RUNTIME, workflow.name, deferred(() => {
          const ports = portsFor(declaration.name, declaration.needs, ctx) as PortsOf<N>;
          const runtimePolicy = declaration.runtimePolicy?.({ ports, config: ctx.config, policy }) ?? policy;
          const args = {
            ports,
            config: ctx.config,
            policy: runtimePolicy,
            checkouts: ctx.checkouts(),
            ctx,
          };
          const runtime = "runtime" in declaration && declaration.runtime
            ? declaration.runtime(args)
            : runtimeFromPieces(declaration as PiecesDeclaration<S, readonly [string, ...string[]], P, N, R, O>, args);
          return completeRuntime(runtime, runtimePolicy, newRecord);
        }));
      };
      const extended = declaration.extend?.(registry, ctx);
      return extended instanceof Promise ? extended.then(registerWorkflow) : registerWorkflow();
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
    plan?(record: R, observation: O, policy: P): Plan;
    readonly decide?: Readonly<Record<string, WorkflowDecision<R, O, P>>>;
    before?(record: R, observation: O, policy: P): Plan | undefined;
    after?(decision: Plan, record: R, observation: O, policy: P): Plan;
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
    plan: (record, observation, chosen) => {
      const current = record as R;
      if (declaration.plan) return declaration.plan(current, observation, chosen);
      const early = declaration.before?.(current, observation, chosen);
      const decision = early ?? declaration.decide?.[current.state]?.(current, observation, chosen);
      if (!decision) throw new Error(`${declaration.name} has no decision for state \`${current.state}\``);
      return declaration.after?.(decision, current, observation, chosen) ?? decision;
    },
  };
}

const LEGACY_MEMBERS = ["plan", "runtime"] as const;
const PIECE_MEMBERS = ["decide", "before", "after", "discover", "progress", "observe", "actions", "remember"] as const;

function declarationMode(declaration: object): void {
  const legacy = LEGACY_MEMBERS.filter((key) => key in declaration);
  const pieces = PIECE_MEMBERS.filter((key) => key in declaration);
  if (legacy.length > 0 && pieces.length > 0) {
    throw new Error(`a workflow declaration cannot mix legacy ${legacy.map((key) => `\`${key}\``).join(", ")} with ${pieces.map((key) => `\`${key}\``).join(", ")}`);
  }
  if (pieces.length > 0) {
    for (const required of ["decide", "observe", "actions"] as const) {
      if (!(required in declaration)) throw new Error(`a three-piece workflow declaration must provide \`${required}\``);
    }
    return;
  }
  if (legacy.length !== LEGACY_MEMBERS.length) throw new Error("a legacy workflow declaration must provide both `plan` and `runtime`");
}

function decisionsFit(workflow: string, states: readonly string[], decide: Readonly<Record<string, unknown>>): void {
  const names = Object.keys(decide);
  const missing = states.filter((state) => !Object.hasOwn(decide, state));
  const extra = names.filter((state) => !states.includes(state));
  if (missing.length === 0 && extra.length === 0) return;
  const details = [
    ...(missing.length ? [`missing ${missing.map((state) => `\`${state}\``).join(", ")}`] : []),
    ...(extra.length ? [`extra ${extra.map((state) => `\`${state}\``).join(", ")}`] : []),
  ];
  throw new Error(`the ${workflow} workflow's \`decide\` does not match its states: ${details.join("; ")}`);
}

function runtimeFromPieces<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O>(
  declaration: PiecesDeclaration<S, readonly [string, ...string[]], P, N, R, O>,
  scope: WorkflowPieceContext<S, P, N>,
): WorkflowRuntimeParts<R, O> {
  const actions = Object.create(null) as Record<string, ActionImplementation<R, O>>;
  const declared = typeof declaration.actions === "function" ? declaration.actions(scope) : declaration.actions;
  for (const [name, implementation] of Object.entries(declared)) {
    actions[name] = typeof implementation === "function"
      ? (effect, work) => (implementation as WorkflowAction<S, P, N, R, O>)(
        { ...scope, ...actionPorts(scope.ports, work, scope.ctx.log, scope.ctx.now) },
        work,
        effect,
      )
      : implementation;
  }
  const progress = typeof declaration.progress === "function" ? declaration.progress(scope) : declaration.progress;
  return {
    ...(progress ? { progress } : {}),
    found: () => declaration.discover?.(scope) ?? Promise.resolve([]),
    observe: (record) => declaration.observe(scope, record),
    actions,
    apply: (record, decision, outcomes, observation, now, moved) =>
      declaration.remember?.(scope, record, outcomes, observation, moved, decision, now) ?? record,
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
