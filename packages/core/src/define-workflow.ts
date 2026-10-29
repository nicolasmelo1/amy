import { Checkouts } from "./checkouts.js";
import { ConfigOf, ConfigSchema } from "./config-schema.js";
import { deferred } from "./deferred.js";
import { Plugin, PluginContext, Workflow } from "./plugin.js";
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
  readonly workflow: Workflow<O, P>;
  newRecord(workId: string, now: Date): R;
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
  readonly states: States;
  readonly waiting: readonly States[number][];
  readonly terminal: readonly States[number][];
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
  const newRecord = (workId: string, now: Date): R => ({
    ...declaration.record(workId),
    id: workId,
    state: declaration.states[0],
    updatedAt: now.toISOString(),
    attempts: {},
    history: [],
  }) as unknown as R;

  const plugin: WorkflowPlugin<R, O, P> = {
    name: declaration.pluginName ?? `workflow-${declaration.name}`,
    configSchema: declaration.configSchema,
    workflow: workflowFor(declaration, declaration.policy),
    newRecord,
    register(registry, untyped) {
      const ctx = untyped as PluginContext<ConfigOf<S>>;
      const policy = policyFor(declaration.name, declaration.policy, ctx.config.policy);
      const workflow = workflowFor(declaration, policy, ctx.config);
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
  };
  return plugin;
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
    readonly states: readonly [string, ...string[]];
    readonly waiting: readonly string[];
    readonly terminal: readonly string[];
    readonly trackerWrites?: Claims<S, P>;
    readonly codeHostWrites?: Claims<S, P>;
    plan(record: R, observation: O, policy: P): Plan;
  },
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
    states: declaration.states,
    waitingStates: declaration.waiting,
    initialState: declaration.states[0],
    terminalStates: declaration.terminal,
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
