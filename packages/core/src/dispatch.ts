import { ActionSpec, PortKind } from "./actions.js";
import { ActionContext, ActionImplementation, WorkflowRuntime } from "./runtime.js";
import { Action, Plan, actionsOf } from "./work.js";

/** A mounted port, looked up by kind when an action needs it. */
export type PortLookup = (kind: PortKind) => object | undefined;

/** Whether an implementation is a port and a method rather than a handler. */
export function isPortBinding(implementation: unknown): implementation is ActionSpec {
  if (implementation === null || typeof implementation !== "object") return false;
  const { port, method } = implementation as Partial<ActionSpec>;
  return typeof port === "string" && typeof method === "string";
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
  if (typeof (target as Record<string, unknown>)[implementation.method] !== "function") {
    return `action \`${name}\`: the \`${implementation.port}\` port has no method \`${implementation.method}\``;
  }
  return null;
}

/**
 * Runs one action through whatever the runtime declared for it.
 *
 * A port-and-method is called with the action and its context, and what it
 * returns lands in `outcomes` under the action's name — the one shape the
 * host can wire without the workflow writing a line.
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
  const result = await target[implementation.method]!(action, context);
  if (result !== undefined) context.outcomes[action.type] = result;
}
