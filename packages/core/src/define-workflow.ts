import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { Checkouts } from "./checkouts.js";
import { ActionSpec, CORE_ACTIONS } from "./actions.js";
import { ActionDuties, actionPorts } from "./action-ports.js";
import { PluginCheck, PluginFile, PluginSetup } from "./commands.js";
import { DeclaredOperation, OPERATIONS_COLLECTION, MountedOperation } from "./operation.js";
import { DIAGRAM_FILE, Diagram, readDiagram } from "./diagram.js";
import { ConfigOf, ConfigSchema, ValueFor, validateConfig } from "./config-schema.js";
import { Call, CallSite, ForkSite, Signature, calledStore, composedRuntime, composedWorkflow, enterCall, isCall } from "./calls.js";
import type { Store } from "./ports/Store.js";
import { BranchLeases, FileLeases } from "./leases.js";
import { PortLookup, reaching } from "./dispatch.js";
import { deferred } from "./deferred.js";
import { Plugin, PluginContext, Registry, Workflow, ProjectPhases } from "./plugin.js";
import { WorkflowRuntime } from "./runtime.js";
import { Action, Moved, Plan, WorkRecord } from "./work.js";
import { ActionContext, ActionImplementation, FoundWork, ProgressPolicy } from "./runtime.js";
import { WORKFLOW_RUNTIME } from "./runtime.js";
import type { BriefRecord } from "./ports/Brief.js";

// Registered, not local: a project's phase is declared with the core its own
// package resolves, and the CLI that mounts it reads the need with its own
// copy. A local symbol is one key per copy, so the need read as undefined.
const PORT_NEED = Symbol.for("@amykit/core/workflow-port-need");

export interface PortNeed<T, Optional extends boolean = false> {
  readonly [PORT_NEED]: { readonly type: T; readonly optional: Optional; readonly requires?: readonly string[] };
}

/**
 * Declares a mounted port a workflow requires.
 *
 * `requires` names the methods a port only offers optionally that this
 * workflow calls, so a mounted adapter without one is refused at boot by
 * name rather than on the first piece of work that reaches it.
 */
export function port<T>(options: { readonly requires?: readonly (keyof T & string)[] } = {}): PortNeed<T> {
  const requires = options.requires ?? [];
  return Object.freeze({ [PORT_NEED]: { optional: false, ...(requires.length > 0 ? { requires: [...requires] } : {}) } }) as PortNeed<T>;
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

/** One thing a brief check refuses: the section it is about and the rule it broke. */
export interface BriefRefusal {
  readonly section: string;
  readonly rule: string;
}

/** One operation a mounted plugin offers, as a brief check reads it: its id and its input's JSON Schema. */
export interface BriefOperation {
  readonly id: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** What a brief check is handed beside the brief: what the mounted machine can do. */
export interface BriefCheckScope {
  /** Every operation the mounted plugins offer, so a section naming one nothing offers can be refused. */
  readonly operations: readonly BriefOperation[];
}

/**
 * The sections a workflow asks a brief to answer, in the order it asks them,
 * and the rule that judges whether the brief is ready.
 *
 * The core never parses a section: the workflow names them and judges them.
 * The host refuses a declared section the brief leaves empty, and asks
 * `check` only once every section this workflow declares is answered, so a
 * check never parses a half-groomed brief. A brief phase that declares no
 * `check` is told so by `amy doctor`, never handed one that always passes.
 */
export interface BriefDeclaration {
  readonly sections: readonly string[];
  check?(record: BriefRecord, scope: BriefCheckScope): readonly BriefRefusal[] | Promise<readonly BriefRefusal[]>;
}

type Claims<S extends ConfigSchema, P extends object> =
  | readonly string[]
  | ((args: { readonly config: ConfigOf<S>; readonly policy: P }) => readonly string[]);

export interface WorkflowPlugin<R extends WorkRecord = WorkRecord, O = unknown, P = unknown, I = unknown, Outs = Record<string, unknown>>
  extends Plugin, Signature<I, Outs> {
  /** Throws, naming why, when the workflow has no states: no diagram was read and none were declared. */
  readonly workflow: Workflow<O, P>;
  newRecord(workId: string, now: Date): R;
  /**
   * The project phases this workflow declared, readable without a mount:
   * the composition of a project reads these off the workflow its config
   * names, and `amy status` reads the mounted one's through the workflow.
   */
  readonly phases?: ProjectPhases;
  /** The brief this workflow asks for and how it judges one, readable without a mount: what `amy brief check` runs. */
  readonly brief?: BriefDeclaration;
}

// Registered rather than private: a workflow may be defined against another
// copy of the core than the host's, and the host still has to hand it its
// diagram.
const DRAW = Symbol.for("@amykit/core/workflow-draw");
/** What a caller reads off a declaration it calls: the declaration and its shape. */
const CALLEE = Symbol.for("@amykit/core/workflow-callee");

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

/** What one end of a callee returns, computed from its record. */
type Outputs<R extends WorkRecord> = { readonly [end: string]: { returned(record: R): unknown }["returned"] };

interface DeclarationBase<
  S extends ConfigSchema,
  P extends object,
  N extends Needs,
  R extends WorkRecord,
  In extends ConfigSchema = ConfigSchema,
  Out extends Outputs<R> = Outputs<R>,
> {
  readonly name: string;
  readonly pluginName?: string;
  /**
   * The project phases this workflow declares, every value the reason the
   * phase it names is absent. See `ProjectPhases`.
   */
  readonly phases?: ProjectPhases;
  /** The sections a brief answers for this workflow, in order, and the check that judges them. See `BriefDeclaration`. */
  readonly brief?: BriefDeclaration;
  // No `states`, `waiting` or `terminal`: the states come only from the
  // `workflow.mmd` the host reads beside the workflow.
  readonly configSchema: S;
  readonly policy: P;
  readonly needs: N;
  readonly trackerWrites?: Claims<S, P>;
  readonly codeHostWrites?: Claims<S, P>;
  /**
   * This workflow's own actions, each with the port it must have mounted to
   * run, one of its `needs`. Carried on the workflow, so a phase another
   * workflow calls still reaches the mount; a core action's name is the
   * core's, and never one of these.
   */
  readonly catalogue?: Readonly<Record<string, ActionSpec>>;
  /** What a caller must pass, typed like a plugin's settings; a record a caller starts holds it as \`input\`. */
  readonly input?: In;
  /** What this workflow returns, keyed by terminal state. A workflow with none returns nothing at any end. */
  readonly output?: Out;
  /** Each state the diagram marks \`call\`, bound to the workflow it calls. */
  readonly calls?: Readonly<Record<string, Call>>;
  /**
   * The operations, checks and files this workflow brings, read beside
   * `register` rather than through it: they have to answer when the machine
   * does not mount, which is when a workflow's own `amy roster` matters most.
   */
  readonly operations?: readonly DeclaredOperation[];
  readonly checks?: readonly PluginCheck<ConfigOf<S>>[];
  readonly files?: readonly PluginFile<ConfigOf<S>>[];
  /** What `amy init` prepares for this workflow, and the environment variables it reads: a plugin's own, carried as they are. */
  readonly setup?: readonly PluginSetup<ConfigOf<S>>[];
  readonly environment?: readonly string[];
  runtimePolicy?(args: { readonly ports: PortsOf<N>; readonly config: ConfigOf<S>; readonly policy: P }): P;
  record(workId: string): Omit<R, keyof WorkRecord>;
  /** Registers the supporting half of a workflow: ports, queues, actions or harnesses. */
  extend?(registry: Registry, ctx: PluginContext<ConfigOf<S>>): void | Promise<void>;
}

interface PiecesDeclaration<S extends ConfigSchema, States extends readonly [string, ...string[]], P extends object, N extends Needs, R extends WorkRecord, O,
  In extends ConfigSchema = ConfigSchema, Out extends Outputs<R> = Outputs<R>>
  extends DeclarationBase<S, P, N, R, In, Out> {
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
  /** Gone: a single `plan()` is refused at mount; its `switch` is `decide`, one key per drawn state. */
  readonly plan?: never;
  /** Gone: a `runtime()` is refused at mount; its parts are `discover`, `observe`, `actions` and `remember`. */
  readonly runtime?: never;
}

type WorkflowDeclaration<S extends ConfigSchema, States extends readonly [string, ...string[]], P extends object, N extends Needs, R extends WorkRecord, O,
  In extends ConfigSchema = ConfigSchema, Out extends Outputs<R> = Outputs<R>> = PiecesDeclaration<S, States, P, N, R, O, In, Out>;

/**
 * What a caller passes, as the callee's schema promises it: a required field
 * must be given, any other may be left out. Nothing for a callee that
 * declares no input.
 */
type InputFor<In extends ConfigSchema> = keyof In extends never ? undefined : Flat<
  { [K in keyof In as In[K] extends { readonly required: true } ? K : never]: ValueFor<In[K]> } &
  { [K in keyof In as In[K] extends { readonly required: true } ? never : K]?: ValueFor<In[K]> }
>;
type Flat<T> = { [K in keyof T]: T[K] };
type OutputsFor<Out> = { [End in keyof Out]: Out[End] extends (...args: never[]) => infer Value ? Value : never };

export function defineWorkflow<
  const S extends ConfigSchema,
  const States extends readonly [string, ...string[]],
  P extends object,
  const N extends Needs,
  R extends WorkRecord,
  O,
  const In extends ConfigSchema = Record<never, never>,
  Out extends Outputs<R> = Record<never, never>,
>(declaration: WorkflowDeclaration<S, States, P, N, R, O, In, Out>): WorkflowPlugin<R, O, P, InputFor<In>, OutputsFor<Out>> {
  return drawnWith(declaration as unknown as Declaration<S, P, N, R, O>, undefined) as unknown as WorkflowPlugin<R, O, P, InputFor<In>, OutputsFor<Out>>;
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
  // Read when asked rather than at import: a call can only be checked once
  // every workflow it names is defined, and a module may define them in any
  // order.
  let unmounted: Assembled | undefined;
  const assembled = (): Assembled => {
    if (typeof shape === "string") refused();
    return (unmounted ??= assemble(declaration as unknown as AnyDeclaration, shape as Shape, undefined, [declaration.name], [declaration as unknown as AnyDeclaration]));
  };

  const plugin = {
    name: declaration.pluginName ?? `workflow-${declaration.name}`,
    configSchema: declaration.configSchema,
    ...(declaration.operations ? { operations: declaration.operations } : {}),
    // A workflow compiled against an older core may still pass `commands`. It
    // is carried as it came, so the host's load refuses it by name rather than
    // the commands disappearing without a word.
    ...retiredCommandsOf(declaration),
    ...(declaration.checks ? { checks: declaration.checks as unknown as readonly PluginCheck[] } : {}),
    ...(declaration.files ? { files: declaration.files as unknown as readonly PluginFile[] } : {}),
    ...(declaration.setup ? { setup: declaration.setup as unknown as readonly PluginSetup[] } : {}),
    ...(declaration.environment ? { environment: declaration.environment } : {}),
    ...(declaration.phases ? { phases: declaration.phases } : {}),
    ...(declaration.brief ? { brief: briefFits(declaration.name, declaration.brief) } : {}),
    newRecord: (workId: string, now: Date): R => assembled().newRecord(workId, now) as R,
    [DRAW]: (diagram: Diagram | Error) => drawnWith(declaration, diagram),
    register(registry: Registry, untyped: PluginContext) {
      declarationMode(declaration);
      if (typeof shape === "string") refused();
      const mounted = assemble(declaration as unknown as AnyDeclaration, shape as Shape, untyped, [declaration.name], [declaration as unknown as AnyDeclaration]);
      const registerWorkflow = () => {
        registry.workflow(mounted.workflow as Workflow<never, never>);
        registry.contribute(WORKFLOW_RUNTIME, mounted.workflow.name, deferred(mounted.runtime));
      };
      const extended = declaration.extend?.(registry, untyped as PluginContext<ConfigOf<S>>);
      return extended instanceof Promise ? extended.then(registerWorkflow) : registerWorkflow();
    },
  } satisfies Omit<WorkflowPlugin<R, O, P>, "workflow"> & Drawable;
  Object.defineProperty(plugin, CALLEE, { value: { declaration: declaration as unknown as AnyDeclaration, shape } satisfies Callable, enumerable: false });
  // A workflow with no states cannot be read until something gives it some,
  // so the unmounted declaration says why when it is asked, not at import.
  Object.defineProperty(plugin, "workflow", { get: () => assembled().workflow, enumerable: typeof shape !== "string" });
  return plugin as unknown as WorkflowPlugin<R, O, P>;
}

/**
 * What a caller composes against, read off a declared workflow its module
 * exports.
 *
 * `input` is the schema the declaration says a caller must pass, undefined
 * when the workflow takes none; `returns` names the ends it returns
 * something at, so a composition folds only where there is something to
 * fold. Nothing for a plugin that is not a `defineWorkflow` declaration —
 * which is the whole answer: such a workflow can be mounted but never
 * called, and a project composes its phases by calling them.
 */
export function declaredCallee(plugin: object): {
  readonly configSchema: ConfigSchema;
  readonly policy: object;
  readonly input?: ConfigSchema;
  readonly returns: readonly string[];
  readonly trackerWrites?: Claims<ConfigSchema, object>;
  readonly codeHostWrites?: Claims<ConfigSchema, object>;
} {
  const callee = (plugin as Partial<Record<typeof CALLEE, Callable | undefined>>)?.[CALLEE];
  if (!callee || typeof callee.shape === "string") return { configSchema: {}, policy: {}, returns: [] };
  const declaration = callee.declaration as Partial<{
    readonly trackerWrites?: Claims<ConfigSchema, object>;
    readonly codeHostWrites?: Claims<ConfigSchema, object>;
  }>;
  return {
    configSchema: callee.declaration.configSchema,
    policy: callee.declaration.policy,
    ...(callee.declaration.input ? { input: callee.declaration.input as ConfigSchema } : {}),
    returns: Object.keys(callee.declaration.output ?? {}),
    ...(declaration.trackerWrites !== undefined ? { trackerWrites: declaration.trackerWrites } : {}),
    ...(declaration.codeHostWrites !== undefined ? { codeHostWrites: declaration.codeHostWrites } : {}),
  };
}

/** A declaration with its types let go of, as assembly reads it. */
type AnyDeclaration = Declaration<ConfigSchema, object, Needs, WorkRecord, unknown>;

/** What a caller reads off a declaration it calls. */
interface Callable {
  readonly declaration: AnyDeclaration;
  readonly shape: Shape | string;
}

/** A workflow put together for one mount, or for none: its decisions, its first record, and how to build its runtime. */
interface Assembled {
  readonly workflow: Workflow;
  readonly policy: object;
  newRecord(workId: string, now: Date, input?: unknown): WorkRecord;
  /** Built by the host once every plugin has registered; throws, by name, when the mount cannot give it what it needs. */
  runtime(): WorkflowRuntime;
}

/**
 * The workflow for one mount, every call in it checked and put together.
 *
 * `ctx` is absent for the declaration a module exports before anything
 * mounts it: its decisions can be read, and its runtime cannot be built.
 * `path` names where in a tree of calls this is, for what is refused, and
 * `trail` the workflows already on the way here, which is how a cycle is
 * found.
 */
function assemble(
  declaration: AnyDeclaration,
  shape: Shape,
  ctx: PluginContext | undefined,
  path: readonly string[],
  trail: readonly AnyDeclaration[],
): Assembled {
  const config = ctx?.config;
  // Refused before a word of it is merged: a policy default the schema does
  // not describe is a setting whose real answer nobody could find from the
  // config the machine explains.
  if (ctx) policyFits(declaration.name, declaration.configSchema, declaration.policy);
  if (ctx && declaration.phases) phasesFit(declaration.name, declaration.phases);
  if (ctx) catalogueFits(declaration, path);
  const policy = policyFor(declaration.name, declaration.policy, config?.policy);
  // Only a workflow with lanes holds branches, and only its lanes take them.
  const forked = Object.keys(shape.diagram?.forks ?? {}).length > 0;
  const leases = ctx && forked ? new FileLeases(() => nodePath.join(ctx.paths.state, "leases")) : undefined;
  const lent = new Map<string, string>();
  const sites = callSites(declaration, shape, ctx, policy, path, trail, leases && { leases, lent });
  const forks = forkSites(shape, sites, path, leases && { leases, lent });
  // Judged at mount, as it always was: a module's exported declaration is
  // read by suites that walk it to find exactly this kind of mistake.
  if (ctx) decisionsFit(declaration.name, shape.states, declaration.decide, [...sites.keys()], [...forks.keys()]);
  const own = (workId: string, now: Date, input?: unknown): WorkRecord => ({
    ...declaration.record(workId),
    ...(input === undefined ? {} : { input: input as Record<string, unknown> }),
    id: workId,
    state: shape.initial,
    updatedAt: now.toISOString(),
    attempts: {},
    looks: {},
    history: [],
  });
  const newRecord = (workId: string, now: Date, input?: unknown): WorkRecord => {
    const record = own(workId, now, input);
    const site = sites.get(record.state);
    return site ? enterCall(record, site, now) : record;
  };
  const workflow = composedWorkflow(workflowFor(declaration, shape, policy, config as ConfigOf<ConfigSchema> | undefined), sites, forks);

  const runtime = (): WorkflowRuntime => {
    if (!ctx) throw new Error(`the ${declaration.name} workflow is not mounted, so it has no runtime`);
    const ports = portsFor(declaration.name, declaration.needs, ctx, path) as PortsOf<Needs>;
    const settings = ctx.config as ConfigOf<ConfigSchema>;
    const runtimePolicy = declaration.runtimePolicy?.({ ports, config: settings, policy }) ?? policy;
    const args = { ports, config: settings, policy: runtimePolicy, checkouts: ctx.checkouts(), ctx: ctx as PluginContext<ConfigOf<ConfigSchema>> };
    const parts = runtimeFromPieces(declaration, args);
    coreActionsFit(declaration, parts.actions, path);
    for (const site of sites.values()) site.runtime = (site as PendingSite).build();
    const lookup: PortLookup = (kind) => (ctx.workflowPort ?? ctx.port)(kind);
    return composedRuntime(completeRuntime(parts, runtimePolicy, (workId, now) => own(workId, now)), sites, lookup, forks);
  };

  return { workflow, policy, newRecord, runtime };
}

/** A call site whose callee's runtime is built when its caller's is. */
interface PendingSite extends CallSite {
  build(): WorkflowRuntime;
}

/**
 * Every call state, checked against the workflow it calls.
 *
 * Each refusal names the call path, because in a tree of calls the workflow
 * that is wrong is not always the one being mounted.
 */
function callSites(
  declaration: AnyDeclaration,
  shape: Shape,
  ctx: PluginContext | undefined,
  policy: object,
  path: readonly string[],
  trail: readonly AnyDeclaration[],
  held?: LaneHolds,
): Map<string, PendingSite> {
  const sites = new Map<string, PendingSite>();
  const declared = declaration.calls ?? {};
  const drawn = shape.diagram?.calls ?? [];
  const where = path.join(" → ");
  for (const state of Object.keys(declared)) {
    if (!shape.diagram) {
      throw new Error(`${where}: binds \`calls.${state}\`, and has no ${DIAGRAM_FILE}: a call state is drawn, with \`class ${state} call\``);
    }
    if (!drawn.includes(state)) {
      throw new Error(`${where}: binds \`calls.${state}\`, and its diagram does not mark \`${state}\` as a call — add \`class ${state} call\``);
    }
  }
  for (const state of drawn) {
    const binding = declared[state];
    if (!isCall(binding)) {
      throw new Error(`${where}: \`${state}\` is a call state with no \`calls\` entry — bind it with \`${state}: call(workflow)\``);
    }
    const lane = Object.values(shape.diagram!.forks).some((fork) => fork.lanes.includes(state));
    sites.set(state, callSite(declaration, shape, ctx, policy, path, trail, state, binding, lane ? held : undefined));
  }
  return sites;
}

/**
 * Every fork the diagram draws, its lanes bound to their calls.
 *
 * Two lanes of one fork that name the same branch would write it at once,
 * and that much can be seen without running anything; a branch only known
 * at run time is held to a lease instead, and the second lane waits for it.
 */
function forkSites(shape: Shape, sites: ReadonlyMap<string, CallSite>, path: readonly string[], held?: LaneHolds): Map<string, ForkSite> {
  const forks = new Map<string, ForkSite>();
  for (const [state, fork] of Object.entries(shape.diagram?.forks ?? {})) {
    const lanes = fork.lanes.map((lane) => sites.get(lane)!);
    const written = new Map<string, string>();
    for (const site of lanes) {
      const branch = site.binding.branch;
      if (branch === undefined) continue;
      const other = written.get(branch);
      if (other !== undefined) {
        throw new Error(`${[...path, state].join(" → ")}: \`${other}\` and \`${site.state}\` both write the branch \`${branch}\`; two lanes of one fork write two branches`);
      }
      written.set(branch, site.state);
    }
    forks.set(state, { state, join: fork.join, lanes, ...(held ?? {}) });
  }
  return forks;
}

function callSite(
  caller: AnyDeclaration,
  shape: Shape,
  ctx: PluginContext | undefined,
  policy: object,
  path: readonly string[],
  trail: readonly AnyDeclaration[],
  state: string,
  binding: Call,
  held?: LaneHolds,
): PendingSite {
  const at = `${[...path, state].join(" → ")}`;
  const callee = calleeOf(binding, at);
  const name = callee.declaration.name;
  const seen = trail.indexOf(callee.declaration);
  if (seen >= 0) throw new Error(`a cycle of calls: ${[...trail.slice(seen), callee.declaration].map((one) => one.name).join(" → ")}`);
  if (typeof callee.shape === "string") throw new Error(`${at}: ${callee.shape}`);
  const declaration = callee.declaration as AnyDeclaration;
  if (declaration.extend) {
    throw new Error(`${at}: ${name} registers its own ports and actions with \`extend\`, so it can be mounted but not called`);
  }
  const edges = returnEdges(shape, state, callee.shape.terminal, name, at);
  signatureFits(binding, declaration, callee.shape.terminal, name, at);

  const settings = validateConfig(at, declaration.configSchema, binding.binding.config);
  if (!settings.ok) throw new Error(settings.problems.join("; "));
  const bound = (kind: string): string => binding.binding.ports?.[kind] ?? kind;
  const scoped = <T>(kind: string, port: T): T => (kind === "store" && port ? calledStore(port as unknown as Store, state) as unknown as T : port);
  const calleeCtx: PluginContext | undefined = ctx && {
    ...ctx,
    config: settings.config,
    // A callee's store lists its own records under each of its caller's, one call deeper.
    port: (kind) => scoped(bound(kind), ctx.port(bound(kind))),
    ...(ctx.workflowPort ? { workflowPort: (kind: string) => scoped(bound(kind), ctx.workflowPort!(bound(kind))) } : {}),
    // A callee's checkouts answer through the same workplace, and a refusal
    // there names the call's workflow — the one whose work stopped — rather
    // than the caller this context was spread from. A deeper call's name is
    // passed through, so the refusal names the innermost one. A lane leases
    // the same workplace, lent its caller's commit.
    checkouts: held
      ? (who) => leasedCheckouts(ctx.checkouts(who ?? name), held)
      : (who) => ctx.checkouts(who ?? name),
  };
  const assembled = assemble(declaration, callee.shape, calleeCtx ?? undefined, [...path, state], [...trail, declaration]);
  if (ctx) claimsFit(caller, ctx.config, policy, declaration, settings.config, assembled.policy, at);

  return {
    state,
    callee: name,
    binding: binding.binding as CallSite["binding"],
    workflow: assembled.workflow,
    policy: assembled.policy,
    edges,
    output: (record) => declaration.output?.[record.state]?.(record),
    newRecord: (workId, now, input) => assembled.newRecord(workId, now, inputFor(declaration, input, `${workId}`)),
    port: (kind) => ctx && (ctx.workflowPort ?? ctx.port)(bound(kind)),
    build: () => assembled.runtime(),
  };
}

/** What the lanes of a fork hold: the branches they took, and the commit each was lent. */
interface LaneHolds {
  readonly leases: BranchLeases;
  readonly lent: Map<string, string>;
}

/**
 * A lane's checkouts: leased, and lent its caller's commit when bound with
 * one — read for the lane's record and every call under it.
 *
 * The lease is composed on the first read, not when the runtime is built: a
 * workflow whose lanes never read their checkouts is still handed nothing,
 * and one that does is lent the branch by the same answer every other read
 * takes.
 */
function leasedCheckouts(checkouts: Checkouts, held: LaneHolds): Checkouts {
  const lent = (workId: string): string | undefined => {
    for (const [id, revision] of held.lent) if (workId === id || workId.startsWith(`${id}/`)) return revision;
    return undefined;
  };
  let leased: Checkouts | undefined;
  const once = (): Checkouts => {
    if (!leased) leased = { git: checkouts.git.leasedTo(held.leases, lent), layout: checkouts.layout };
    return leased;
  };
  return {
    get git() {
      return once().git;
    },
    get layout() {
      return once().layout;
    },
  };
}

function calleeOf(binding: Call, at: string): Callable {
  const reference = binding.callee;
  const target = typeof reference === "function" && !(CALLEE in reference) ? (reference as () => object)() : reference;
  const callee = (target as Partial<Record<typeof CALLEE, Callable>> | undefined)?.[CALLEE];
  if (!callee) throw new Error(`${at}: calls something that is not a workflow declared with \`defineWorkflow\``);
  return callee;
}

/**
 * Where the caller goes from each of the callee's ends: the edge out of the
 * call state named for it. An end with no edge, an edge named for no end and
 * an end with two edges are each refused.
 */
function returnEdges(shape: Shape, state: string, ends: readonly string[], callee: string, at: string): Record<string, string> {
  const out = (shape.diagram?.transitions ?? []).filter((edge) => edge.from === state);
  for (const edge of out) {
    if (!ends.includes(edge.label ?? "")) {
      throw new Error(`${at}: \`${state} --> ${edge.to}\` is not named for an end of ${callee}, which ends at ${ends.map((end) => `\`${end}\``).join(", ")}`);
    }
  }
  return Object.fromEntries(ends.map((end) => {
    const named = out.filter((edge) => edge.label === end);
    if (named.length === 0) {
      throw new Error(`${at}: ${callee} can end at \`${end}\`, and no edge out of \`${state}\` is named \`${end}\` — draw \`${state} --> SOMEWHERE: ${end}\``);
    }
    if (named.length > 1) throw new Error(`${at}: two edges out of \`${state}\` are named \`${end}\`; a return goes one place`);
    return [end, named[0]!.to];
  }));
}

/** The binding's `input`, `output` and `effects` against what the callee declares it takes and returns. */
function signatureFits(binding: Call, callee: AnyDeclaration, ends: readonly string[], name: string, at: string): void {
  inputFits(binding, callee, name, at);
  const named = ends.map((state) => `\`${state}\``).join(", ");
  for (const end of Object.keys(binding.binding.output ?? {})) {
    if (!ends.includes(end)) throw new Error(`${at}: \`output.${end}\` folds an end ${name} does not have; it ends at ${named}`);
    if (!callee.output?.[end]) throw new Error(`${at}: \`output.${end}\` folds what ${name} returns at \`${end}\`, and it returns nothing there`);
  }
  for (const end of Object.keys(binding.binding.effects ?? {})) {
    if (!ends.includes(end)) throw new Error(`${at}: \`effects.${end}\` is for an end ${name} does not have; it ends at ${named}`);
  }
}

/** An input only for a callee that takes one, and one for every callee that needs one. */
function inputFits(binding: Call, callee: AnyDeclaration, name: string, at: string): void {
  const { input } = binding.binding;
  if (input && !callee.input) throw new Error(`${at}: passes an \`input\`, and ${name} takes none`);
  const required = Object.entries(callee.input ?? {}).filter(([, field]) => field.required && field.default === undefined).map(([field]) => field);
  if (!input && required.length > 0) {
    throw new Error(`${at}: ${name} needs an \`input\` with ${required.map((field) => `\`${field}\``).join(", ")}, and the call passes none`);
  }
}

/** What a callee is started with, held to its schema at the moment the call is made. */
function inputFor(callee: AnyDeclaration, input: unknown, workId: string): unknown {
  if (!callee.input) return undefined;
  const checked = validateConfig(`the input ${workId} was called with`, callee.input, input);
  if (!checked.ok) throw new Error(checked.problems.join("; "));
  return checked.config;
}

/** A callee writes nothing its caller did not claim, so installing one cannot widen what the person granted. */
function claimsFit(
  caller: AnyDeclaration,
  callerConfig: Record<string, unknown>,
  callerPolicy: object,
  callee: AnyDeclaration,
  calleeConfig: Record<string, unknown>,
  calleePolicy: object,
  at: string,
): void {
  for (const [field, port] of [["trackerWrites", "tracker"], ["codeHostWrites", "code-host"]] as const) {
    const granted = claimsOf(caller[field], callerConfig, callerPolicy);
    for (const write of claimsOf(callee[field], calleeConfig, calleePolicy)) {
      if (!granted.includes(write)) {
        throw new Error(`${at}: ${callee.name} claims the ${port} write \`${write}\`, and ${caller.name} does not claim it`);
      }
    }
  }
}

function claimsOf(value: Claims<ConfigSchema, object> | undefined, config: Record<string, unknown>, policy: object): readonly string[] {
  if (typeof value !== "function") return value ?? [];
  return value({ config: config as ConfigOf<ConfigSchema>, policy });
}

/**
 * Where the states come from, or why there are none.
 *
 * The diagram is the only shape: a workflow says its states once, in the
 * file beside it. One whose host found no diagram cannot mount, and a
 * diagram amy cannot read is refused with the line it stopped at. A
 * declaration still carrying the lists it used to declare is refused by
 * name, so the fact is not said twice.
 */
function shapeOf(declaration: { readonly name: string }, drawn: Diagram | Error | undefined): Shape | string {
  const workflow = `the ${declaration.name} workflow`;
  if (drawn instanceof Error) return `${workflow} has a diagram amy cannot read — ${drawn.message}`;
  const declared = (["states", "waiting", "terminal"] as const).filter((field) => field in declaration);
  if (declared.length > 0) {
    return `${workflow} declares ${declared.map((field) => `\`${field}\``).join(", ")}; delete them, a workflow's states come only from its ${DIAGRAM_FILE}`;
  }
  if (!drawn) {
    return `${workflow} has no ${DIAGRAM_FILE}: draw one beside its entry or at its package root — a workflow's states come only from its diagram`;
  }
  // Waiting on the owner is still waiting, as far as the engine is concerned.
  const waiting = drawn.states.filter((state) => drawn.waiting.includes(state) || drawn.attention.includes(state));
  return { states: drawn.states, initial: drawn.initial, waiting, terminal: drawn.terminal, diagram: drawn };
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
  for (const directory of [nodePath.dirname(file), packageRoot(nodePath.dirname(file))]) {
    if (directory === undefined) continue;
    const candidate = nodePath.join(directory, DIAGRAM_FILE);
    if (fs.existsSync(candidate)) return { path: candidate, text: fs.readFileSync(candidate, "utf-8") };
  }
  return undefined;
}

function packageRoot(from: string): string | undefined {
  for (let directory = from; ; directory = nodePath.dirname(directory)) {
    if (fs.existsSync(nodePath.join(directory, "package.json"))) return directory;
    if (nodePath.dirname(directory) === directory) return undefined;
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
      throw new Error(`${plugin.name} registers its workflow by hand and has ${source} beside it; a workflow says its states once — move it onto \`defineWorkflow\``);
    },
  } as unknown as T;
}

/** The plugin, shaped by the diagram beside its entry when there is one, and unchanged when there is none. */
export function withDiagramBeside<T extends Plugin>(plugin: T, entry: string | URL): T {
  const found = diagramBeside(entry);
  return found ? withDiagram(plugin, found.text, found.path) : plugin;
}

/**
 * The plugin, refused at mount if it registers a workflow by hand.
 *
 * A host that mounts what somebody installed calls this on every plugin it
 * loads: every workflow it mounts is a `defineWorkflow` with a diagram, so a
 * raw `registry.workflow(...)` is refused naming the plugin. A declaration,
 * and a plugin that registers no workflow, pass through unchanged.
 */
export function declaredWorkflowsOnly<T extends Plugin>(plugin: T): T {
  if (DRAW in plugin) return plugin;
  const refuse = (): never => {
    throw new Error(`${plugin.name} registers a workflow by hand; amy mounts a workflow declared with \`defineWorkflow\` and a ${DIAGRAM_FILE} beside it — move it onto them`);
  };
  const register: Plugin["register"] = (registry, ctx) =>
    plugin.register(receiverKept(registry, { workflow: refuse }), ctx);
  return receiverKept(plugin, { register });
}

/**
 * The object with some members replaced, every other one read and called on
 * the object itself. A class whose getters or methods read `#private`
 * fields throws on any other receiver, so a prototype wrapper cannot do this.
 */
function receiverKept<T extends object>(target: T, replaced: Readonly<Record<string, unknown>>): T {
  const own = (key: string | symbol): boolean => typeof key === "string" && Object.hasOwn(replaced, key);
  // The proxy stands on an empty object of its own, never on the target: a
  // frozen target would make every replaced member break a Proxy invariant.
  const stand = Object.create(Object.getPrototypeOf(target) as object | null) as T;
  return new Proxy(stand, {
    get(_stand, key) {
      if (own(key)) return replaced[key as string];
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
    has: (_stand, key) => own(key) || Reflect.has(target, key),
    ownKeys: () => [...new Set([...Reflect.ownKeys(target), ...Object.keys(replaced)])],
    getOwnPropertyDescriptor(_stand, key) {
      const descriptor = own(key)
        ? { value: replaced[key as string], writable: false, enumerable: true }
        : Reflect.getOwnPropertyDescriptor(target, key);
      return descriptor && { ...descriptor, configurable: true };
    },
  });
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
    readonly phases?: ProjectPhases;
    readonly trackerWrites?: Claims<S, P>;
    readonly codeHostWrites?: Claims<S, P>;
    readonly catalogue?: Readonly<Record<string, ActionSpec>>;
    readonly decide: Readonly<Record<string, WorkflowDecision<R, O, P>>>;
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
    ...(declaration.phases ? { phases: declaration.phases } : {}),
    trackerWrites: claims(declaration.trackerWrites),
    codeHostWrites: claims(declaration.codeHostWrites),
    ...(declaration.catalogue ? { catalogue: declaration.catalogue } : {}),
    // What it says before any decision passes through `after` like any plan,
    // so a write it makes in a fork is handed over as one anywhere else is.
    ...(declaration.before ? {
      interrupt: (record: WorkRecord, observation: O, chosen: P) => {
        const early = declaration.before!(record as R, observation, chosen);
        return early && (declaration.after?.(early, record as R, observation, chosen) ?? early);
      },
    } : {}),
    plan: (record, observation, chosen) => {
      const current = record as R;
      const early = declaration.before?.(current, observation, chosen);
      const decision = early ?? declaration.decide[current.state]?.(current, observation, chosen);
      if (!decision) throw new Error(`${declaration.name} has no decision for state \`${current.state}\``);
      return declaration.after?.(decision, current, observation, chosen) ?? decision;
    },
  };
}

const GONE = { plan: "`decide`, one key per drawn state", runtime: "`discover`, `observe`, `actions` and `remember`" } as const;

/**
 * Only the pieces form mounts. A declaration still passing the old `plan`
 * or `runtime` is refused naming each and where it went, rather than read as
 * a workflow whose decisions are all missing.
 */
function declarationMode(declaration: { readonly name: string }): void {
  const gone = (Object.keys(GONE) as (keyof typeof GONE)[]).filter((key) => key in declaration);
  if (gone.length > 0) {
    const moves = gone.map((key) => `\`${key}\` moves onto ${GONE[key]}`).join("; ");
    throw new Error(`the ${declaration.name} workflow declares ${gone.map((key) => `\`${key}\``).join(" and ")}, which no longer mount: ${moves}`);
  }
  for (const required of ["decide", "observe", "actions"] as const) {
    if (!(required in declaration)) throw new Error(`the ${declaration.name} workflow declares no \`${required}\`; a workflow is its diagram, \`decide\` and \`actions\``);
  }
}

function decisionsFit(workflow: string, states: readonly string[], decide: Readonly<Record<string, unknown>>, calls: readonly string[], forks: readonly string[]): void {
  const names = Object.keys(decide);
  const decided = states.filter((state) => !calls.includes(state) && !forks.includes(state));
  const missing = decided.filter((state) => !Object.hasOwn(decide, state));
  const extra = names.filter((state) => !states.includes(state));
  // A call is its own decision: the callee decides, and its ends say where the caller goes.
  const called = names.filter((state) => calls.includes(state));
  // A fork too: its lanes decide, and the join is where the caller does.
  const forked = names.filter((state) => forks.includes(state));
  if (missing.length === 0 && extra.length === 0 && called.length === 0 && forked.length === 0) return;
  const named = (list: readonly string[]) => list.map((state) => `\`${state}\``).join(", ");
  const details = [
    ...(missing.length ? [`missing ${named(missing)}`] : []),
    ...(extra.length ? [`extra ${named(extra)}`] : []),
    ...(called.length ? [`${named(called)} ${called.length === 1 ? "is a call state" : "are call states"}, decided by the workflow called there`] : []),
    ...(forked.length ? [`${named(forked)} ${forked.length === 1 ? "is a fork" : "are forks"}, moved by its lanes; the join is where the decision is`] : []),
  ];
  throw new Error(`the ${workflow} workflow's \`decide\` does not match its states: ${details.join("; ")}`);
}

/** `commands` a declaration still carries, kept so the host can refuse them by name. */
function retiredCommandsOf(declaration: object): { readonly commands?: unknown } {
  const commands = (declaration as { commands?: unknown }).commands;
  return commands === undefined ? {} : { commands };
}

/**
 * The operations the plugins this profile mounted offer, read when an action
 * asks: a plugin listed after the workflow has still offered its own.
 */
function operationsOf(ctx: PluginContext): (id: string) => (MountedOperation & { port(name: string): unknown }) | undefined {
  return (id) => {
    const offered = ctx.contributions(OPERATIONS_COLLECTION).get(id) as MountedOperation | undefined;
    return offered ? { ...offered, port: (name: string) => ctx.port(name) } : undefined;
  };
}

function runtimeFromPieces<S extends ConfigSchema, P extends object, N extends Needs, R extends WorkRecord, O>(
  declaration: Declaration<S, P, N, R, O>,
  scope: WorkflowPieceContext<S, P, N>,
): WorkflowRuntimeParts<R, O> {
  const actions = Object.create(null) as Record<string, ActionImplementation<R, O>>;
  const declared = typeof declaration.actions === "function" ? declaration.actions(scope) : declaration.actions;
  for (const [name, implementation] of Object.entries(declared)) {
    // A handler says the port its catalogue entry names, so the budget counts
    // one catalogued on the agent as spending it, through every call.
    actions[name] = typeof implementation === "function"
      ? reaching<ActionImplementation<R, O>>((effect, work) => (implementation as WorkflowAction<S, P, N, R, O>)(
        { ...scope, ...actionPorts(scope.ports, work, scope.ctx.log, scope.ctx.now, operationsOf(scope.ctx)) },
        work,
        effect,
      ), declaration.catalogue?.[name])
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

function portsFor(workflow: string, needs: Needs, ctx: PluginContext, path: readonly string[] = [workflow]): Record<string, unknown> {
  // A callee's need is refused with the whole call path, so the person
  // reading it knows which call in the tree is missing a port at the root.
  const called = path.length > 1;
  return Object.fromEntries(Object.entries(needs).map(([kind, need]) => {
    const { optional: canBeAbsent, requires = [] } = (need as PortNeed<unknown, boolean>)[PORT_NEED];
    const mounted = ctx.port(kind);
    if (!mounted && !canBeAbsent) {
      throw new Error(called ? `${path.join(" → ")}: needs ${kind}` : `the ${workflow} workflow needs the \`${kind}\` port, and nothing mounted it`);
    }
    const lacking = mounted ? requires.filter((method) => typeof (mounted as Record<string, unknown>)[method] !== "function") : [];
    if (lacking.length > 0) {
      const methods = lacking.map((method) => `\`${method}\``).join(", ");
      throw new Error(`${called ? path.join(" → ") : `the ${workflow} workflow`}: needs ${kind} to offer ${methods}, and the mounted one does not`);
    }
    return [kind, mounted];
  }));
}

/**
 * The decision's defaults, over what the machine said.
 *
 * Which keys may exist is the schema's word — the mount validated the config
 * against it, with every leaf of a policy group checked by name — and the
 * schema's defaults are the declaration's own, held equal by the mount's
 * consistency check. What is left here is the one merge both of those made
 * possible: what somebody wrote wins, what they left out keeps its default.
 */
export function policyFor<P extends object>(workflow: string, defaults: P, configured: unknown): P {
  const overrides = configured ?? {};
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error(`${workflow} policy must be a mapping`);
  }
  return { ...defaults, ...overrides };
}

/** The ports every action is handed whatever it needs: `announce` reaches the notifier for any workflow. */
const HELD_BY_EVERY_WORKFLOW = new Set(["notifier"]);

/** A catalogue entry is the workflow's own action, on a port it needs. */
function catalogueFits(declaration: AnyDeclaration, path: readonly string[]): void {
  const problems: string[] = [];
  for (const [name, spec] of Object.entries(declaration.catalogue ?? {})) {
    if (Object.hasOwn(CORE_ACTIONS, name)) {
      problems.push(`\`${name}\` is the core's action, run on \`${CORE_ACTIONS[name]!.port}\`; name this workflow's own action something else`);
    } else if (!Object.hasOwn(declaration.needs ?? {}, spec.port)) {
      problems.push(`\`${name}\` is catalogued on the \`${spec.port}\` port, which ${declaration.name} does not need`);
    }
  }
  if (problems.length > 0) throw new Error(`${path.join(" → ")}: its catalogue — ${problems.join("; ")}`);
}

/**
 * A handler under a core action's name implements the core's action, which
 * the catalogue runs on its port: a workflow that does not need that port
 * has taken the name for something else, and the budget and the write check
 * would count a write it never makes.
 */
function coreActionsFit(declaration: AnyDeclaration, actions: Readonly<Record<string, unknown>>, path: readonly string[]): void {
  const problems: string[] = [];
  for (const [name, implementation] of Object.entries(actions)) {
    const spec = CORE_ACTIONS[name];
    if (typeof implementation !== "function" || !spec || HELD_BY_EVERY_WORKFLOW.has(spec.port) || Object.hasOwn(declaration.needs ?? {}, spec.port)) continue;
    problems.push(`action \`${name}\` is the core's, run on the \`${spec.port}\` port, which ${declaration.name} does not need — need the port, or name its own action something else`);
  }
  if (problems.length > 0) throw new Error(`${path.join(" → ")}: ${problems.join("; ")}`);
}

/**
 * Every default a workflow's decision reads, its schema must say too.
 *
 * The policy is not a `record` field hiding its members any more: each one is
 * a schema entry, `policy.<key>`, with the type, the default and the reason —
 * which is what `amy config explain` prints and what the boot check holds the
 * template to. A decision reading a key the schema does not declare, or a
 * schema stating a default different from the one the decision reads, is
 * refused at mount, naming the key: two answers to the same question is one
 * lie waiting for the person who tunes the wrong one.
 */
function policyFits(workflow: string, schema: ConfigSchema, defaults: object): void {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(defaults)) {
    const entry = schema[`policy.${key}`];
    if (entry === undefined) {
      problems.push(
        `the ${workflow} workflow reads \`policy.${key}\`, and its schema declares no such setting — declare \`policy.${key}\` with a type, a default and a description`,
      );
      continue;
    }
    if (entry.default !== value) {
      problems.push(
        `the ${workflow} workflow's schema says \`policy.${key}\` defaults to ${describeDefault(entry.default)}, and its decision reads ${describeDefault(value)} — both name the same machine`,
      );
    }
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
}

function describeDefault(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

/**
 * Every phase a declaration names absent must say why in one word or more.
 *
 * `phases` is a declaration of absence, not a flag: a value that is empty or
 * not prose tells nobody what the project loses without the phase, which is
 * the only reason it earns a word at all.
 */
function phasesFit(workflow: string, phases: ProjectPhases): void {
  const absent = Object.entries(phases).filter(([, reason]) => reason !== undefined);
  const empty = absent.filter(([, reason]) => typeof reason !== "string" || (reason as string).trim() === "");
  if (empty.length > 0) {
    throw new Error(`the ${workflow} workflow's \`phases\` names ${empty.map(([phase]) => `\`${phase}\``).join(", ")} with no reason: say in one sentence why it is absent`);
  }
}

/**
 * A brief declaration names at least one section, each once and each in
 * words: a section with no name is one nobody can be asked, and a name given
 * twice is one answer written to two places.
 *
 * Checked where the declaration is read, because `amy brief` reads it
 * without a mount, and a phase is called rather than mounted.
 */
function briefFits(workflow: string, brief: BriefDeclaration): BriefDeclaration {
  const sections = Array.isArray(brief.sections) ? brief.sections : [];
  const problems: string[] = [];
  if (sections.length === 0) problems.push("names no section");
  const blank = sections.filter((name) => typeof name !== "string" || name.trim() === "");
  if (blank.length > 0) problems.push("names a section with no name");
  const twice = sections.filter((name, at) => sections.indexOf(name) !== at);
  if (twice.length > 0) problems.push(`names ${[...new Set(twice)].map((name) => `\`${name}\``).join(", ")} more than once`);
  if (brief.check !== undefined && typeof brief.check !== "function") problems.push("has a `check` that is not a function");
  if (problems.length > 0) throw new Error(`the ${workflow} workflow's \`brief\` ${problems.join(" and ")}`);
  return brief;
}
