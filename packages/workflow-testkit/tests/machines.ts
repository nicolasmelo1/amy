import { ActionHandler, Plan, Workflow, WorkflowRuntime, WorkRecord } from "@amykit/core";

/**
 * The smallest workflow a test can say something about.
 *
 * Every test here writes one on purpose, broken in exactly the way the test
 * is about, because the claim is that the kit catches the defect and not that
 * it catches whatever the shipped workflows happen to do.
 */
export interface Machine<O> {
  states: string[];
  terminal: string[];
  waiting?: string[];
  uses?: string[];
  plan(record: WorkRecord, observation: O): Plan;
}

export function workflowOf<O>(machine: Machine<O>): Workflow<O, unknown> {
  return {
    name: "tiny",
    states: machine.states,
    waitingStates: machine.waiting ?? [],
    initialState: machine.states[0]!,
    terminalStates: machine.terminal,
    usesActions: machine.uses ?? [],
    usesObservers: [],
    plan: (record, observation) => machine.plan(record, observation),
  };
}

export interface RuntimeParts<R extends WorkRecord, O> {
  observe(record: R): O | Promise<O>;
  handlers?: Record<string, ActionHandler<R, O>>;
  /** Folds what the handlers put in the outcomes bag onto the record. */
  apply?(record: R, outcomes: Record<string, unknown>): R;
}

/**
 * A runtime over the parts a test cares about, whose records start in `initial`.
 *
 * The observation type is the workflow's, named by the test when it has one,
 * and never inferred from what `observe` happens to return.
 */
export function runtimeOf<R extends WorkRecord = WorkRecord, O = unknown>(
  initial: string,
  parts: RuntimeParts<R, NoInfer<O>>,
): WorkflowRuntime<R, O> {
  return {
    policy: {},
    found: async () => [],
    newRecord: (id, now) => ({ id, state: initial, updatedAt: now.toISOString(), attempts: {}, history: [] }) as unknown as R,
    observe: async (record) => parts.observe(record),
    handlers: () => parts.handlers ?? {},
    apply: (record, _plan, outcomes) => parts.apply?.(record, outcomes) ?? record,
  };
}

export const advance = (to: string, ...types: string[]): Plan => ({
  kind: "advance",
  to,
  effects: types.map((type) => ({ type })),
  why: `to ${to}`,
});
export const act = (...types: string[]): Plan => ({ kind: "act", effects: types.map((type) => ({ type })), why: "acting" });
export const wait = (): Plan => ({ kind: "wait", retryAfterMs: 60_000, why: "waiting", effects: [] });
export const settled = (): Plan => ({ kind: "settled", why: "done" });
