import { ActionSpec, PortKind } from "./actions.js";
import { ActionContext, ActionImplementation, WorkflowRuntime } from "./runtime.js";
import { Action, Plan, actionsOf } from "./work.js";

/** A mounted port, looked up by kind when an action needs it. */
export type PortLookup = (kind: PortKind) => object | undefined;

/** Marks a port method as taking `(action, context)`, set by `acceptsAction`. */
const ACCEPTS_ACTION = Symbol.for("amykit.acceptsAction");

/**
 * Marks a port method as one the host may call with `(action, context)`.
 *
 * A port method written for its own callers — `check(repo, workId)`, say —
 * would be handed an action where it expects a repository, and run wrong
 * rather than fail. So a port-and-method declaration only reaches a method
 * that opted in, and the mount refuses one that did not.
 */
export function acceptsAction<F extends (action: Action, context: ActionContext) => unknown>(method: F): F {
  Object.defineProperty(method, ACCEPTS_ACTION, { value: true });
  return method;
}

/** Whether a port method opted in to being called with an action. */
function takesAnAction(method: unknown): boolean {
  return typeof method === "function" && (method as unknown as Record<symbol, unknown>)[ACCEPTS_ACTION] === true;
}

/** Whether an implementation is a port and a method rather than a handler. */
export function isPortBinding(implementation: unknown): implementation is ActionSpec {
  if (implementation === null || typeof implementation !== "object") return false;
  const { port, method } = implementation as Partial<ActionSpec>;
  return typeof port === "string" && typeof method === "string";
}

const REACHES = Symbol.for("@amykit/core/reaches");

/**
 * The port an action spends, whether it is declared as a port and a method or
 * dispatched by a host that runs one on somebody's behalf — a lane's action,
 * run against the lane's own record. What a budget asks before the call.
 */
export function portReachedBy(implementation: unknown): string | undefined {
  return declaredBinding(implementation)?.port;
}

/**
 * The port and method an action is declared to run, whether it is that
 * binding itself or a dispatcher the host built around it — so what the
 * mount checks of a binding (which port, whether it writes, whether the
 * workflow claimed the write) it checks however the action is dispatched.
 */
export function declaredBinding(implementation: unknown): ActionSpec | undefined {
  if (isPortBinding(implementation)) return implementation;
  return (implementation as { [REACHES]?: ActionSpec } | undefined)?.[REACHES];
}

/** A dispatcher that runs a declared port and method, still saying which it runs. */
export function reaching<T extends object>(dispatcher: T, binding: ActionSpec | undefined): T {
  return binding === undefined ? dispatcher : Object.assign(dispatcher, { [REACHES]: binding });
}

/** The actions a runtime declares: the keys of its map, and nothing else. */
export function declaredActions(runtime: Pick<WorkflowRuntime, "actions">): string[] {
  return Object.keys(runtime.actions);
}

/**
 * What a runtime has behind one action name, or `undefined` when it never
 * declared it. Own keys only, so `toString` is not an action.
 */
export function implementationOf(
  runtime: Pick<WorkflowRuntime, "actions">,
  name: string,
): ActionImplementation | undefined {
  return Object.hasOwn(runtime.actions, name)
    ? (runtime.actions[name] as ActionImplementation)
    : undefined;
}

/** The actions a plan carries that the runtime never declared, in order. */
export function undeclaredIn(runtime: Pick<WorkflowRuntime, "actions">, plan: Plan): string[] {
  return actionsOf(plan)
    .map((action) => action.type)
    .filter((name) => !Object.hasOwn(runtime.actions, name));
}

/**
 * Why a declared action could not run, or `null` when it could.
 *
 * Asked at boot of every key, so a declaration with nothing behind it is
 * refused by name before any work reaches the state that plans it.
 */
export function unrunnable(name: string, implementation: unknown, port: PortLookup): string | null {
  if (typeof implementation === "function") return null;
  if (!isPortBinding(implementation)) {
    return `action \`${name}\` is declared with no implementation — give it a handler, or a port and a method`;
  }

  const target = port(implementation.port);
  if (!target) {
    return `action \`${name}\`: needs the \`${implementation.port}\` port, which nothing mounted`;
  }
  const method = (target as Record<string, unknown>)[implementation.method];
  if (typeof method !== "function") {
    return `action \`${name}\`: the \`${implementation.port}\` port has no method \`${implementation.method}\``;
  }
  if (!takesAnAction(method)) {
    return (
      `action \`${name}\`: \`${implementation.port}.${implementation.method}\` takes its own arguments, not an action — ` +
      `write a handler that calls it, or mark it with \`acceptsAction\``
    );
  }
  return null;
}

/**
 * Runs one action through whatever the runtime declared for it.
 *
 * A port-and-method is called with the action and its context, and what it
 * returns — `undefined` included — lands in `outcomes` under the action's
 * name: the one shape the host can wire without the workflow writing a line.
 */
export async function runAction(
  implementation: ActionImplementation | undefined,
  action: Action,
  context: ActionContext,
  port: PortLookup,
): Promise<void> {
  if (typeof implementation === "function") {
    await implementation(action, context);
    return;
  }

  const problem = unrunnable(action.type, implementation, port);
  if (problem || !isPortBinding(implementation)) {
    throw new Error(problem ?? `action \`${action.type}\` has no implementation`);
  }

  const target = port(implementation.port) as Record<string, (...args: unknown[]) => unknown>;
  context.outcomes[action.type] = await target[implementation.method]!(action, context);
}
