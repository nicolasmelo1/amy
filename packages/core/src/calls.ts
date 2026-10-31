/**
 * A state that calls another workflow, the way code calls a function.
 *
 * The callee runs as a child record kept inside its caller's, with its own
 * id, history and attempts, and only the deepest record in a call is ever
 * observed or decided. See `docs/design/a-workflow-calls-another.md`.
 */

import { PortLookup, implementationOf, isPortBinding, runAction } from "./dispatch.js";
import { ActionImplementation, WorkflowRuntime } from "./runtime.js";
import { Workflow } from "./plugin.js";
import { Action, Moved, Plan, WorkRecord, applyPlan, movedBy } from "./work.js";

const CALL = Symbol.for("@amykit/core/call");
/** The child's own plan, carried on the one its caller's engine is handed. */
const INNER = Symbol.for("@amykit/core/call-inner");
/** The end a child reached, carried on the move its caller makes for it. */
const RETURNED = Symbol.for("@amykit/core/call-returned");
/** A record in a call state that holds no call, entering it now. */
const ENTER = Symbol.for("@amykit/core/call-enter");

/**
 * Where a caller's observation keeps its child's.
 *
 * A string rather than a symbol, so a copy of the observation — the testkit
 * keeps one of every look — still carries it.
 */
export const CALLED = "@amykit/called";

/**
 * What a caller says about one call: what it passes, the callee's settings
 * for this call site, which of the root's ports stand for the callee's needs,
 * and how each return value folds back. Every member is optional.
 */
export interface CallBinding<R extends WorkRecord = WorkRecord, I = unknown, Outs = Record<string, unknown>> {
  readonly input?: (work: R) => I;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly ports?: Readonly<Record<string, string>>;
  readonly output?: { readonly [End in keyof Outs]?: (work: R, out: Outs[End]) => R };
  /**
   * What the caller does on the edge out, as any advance may carry effects:
   * say where the pull request is, say why it was refused. Each runs as one
   * of the caller's own actions.
   */
  readonly effects?: { readonly [End in keyof Outs]?: (work: R, out: Outs[End]) => Action[] };
}

/** A callee as a caller names it: the workflow, or a function returning it for one defined later. */
export type CalleeReference<C extends object = object> = C | (() => C);

/**
 * A bound call, its caller's record type let go of: the binding was typed
 * where `call` was written, and a declaration's own record type is inferred
 * from its decisions rather than from here.
 */
export interface Call {
  readonly [CALL]: true;
  readonly callee: CalleeReference;
  readonly binding: CallBinding;
}

/** The input and the return values a callee declares, carried for the binding's types only. */
declare const SIGNATURE: unique symbol;
export interface Signature<I = unknown, Outs = Record<string, unknown>> {
  readonly [SIGNATURE]?: { readonly input: I; readonly outputs: Outs };
}

type InputOf<C> = C extends Signature<infer I, Record<string, unknown>> ? I : unknown;
type OutputsOf<C> = C extends Signature<unknown, infer Outs> ? (unknown extends Outs ? Record<string, unknown> : Outs) : Record<string, unknown>;

/**
 * Binds a call state to the workflow it calls.
 *
 * `call(review)` is the whole call when the callee takes nothing and the
 * caller keeps nothing it returns.
 */
export function call<C extends object, R extends WorkRecord = WorkRecord>(
  callee: CalleeReference<C>,
  binding: CallBinding<R, InputOf<C>, OutputsOf<C>> = {},
): Call {
  return Object.freeze({ [CALL]: true as const, callee, binding: binding as unknown as CallBinding });
}

export function isCall(value: unknown): value is Call {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[CALL] === true;
}

/** Everything one call state needs once the mount has checked it. */
export interface CallSite {
  readonly state: string;
  /** The callee's name, for what is said about it. */
  readonly callee: string;
  readonly binding: CallBinding;
  /** The callee's workflow, itself composed when it calls others. */
  readonly workflow: Workflow;
  /** The callee's policy before its runtime exists. */
  readonly policy: unknown;
  /** Where the caller goes when the callee ends at each of its terminal states. */
  readonly edges: Readonly<Record<string, string>>;
  /** What the callee returns at an end, or undefined at one that returns nothing. */
  output(record: WorkRecord): unknown;
  /** A new callee record, already inside its own first call when it starts in one. */
  newRecord(workId: string, now: Date, input: unknown): WorkRecord;
  /** The callee's runtime, once the mount has built it. */
  runtime?: WorkflowRuntime;
  /** The root's ports as this callee is bound to them. */
  readonly port: PortLookup;
}

/** The record a caller is waiting on, or undefined when it is not in a call. */
export function activeCall(record: WorkRecord): WorkRecord | undefined {
  return record.calling === undefined ? undefined : record.calls?.[record.calling];
}

/** The record and every record it is waiting on, deepest last. */
export function callPath(record: WorkRecord): WorkRecord[] {
  const path = [record];
  for (let child = activeCall(record); child; child = activeCall(child)) path.push(child);
  return path;
}

/** One record on a call path, with the workflow that drives it. */
export interface CallStep {
  readonly record: WorkRecord;
  readonly workflow: Workflow;
}

/**
 * Where a piece of work stands through every call it is in: each record from
 * the root down, and whether the deepest one is waiting on its owner. A child
 * that escalates is the root's attention, because the root is what a person
 * sees.
 */
export function callStanding(workflow: Workflow, record: WorkRecord): { readonly path: readonly CallStep[]; readonly attention: boolean; readonly waiting: boolean } {
  const path: CallStep[] = [];
  let at: Workflow | undefined = workflow;
  for (const step of callPath(record)) {
    if (!at) break;
    path.push({ record: step, workflow: at });
    at = at.calls?.[step.state];
  }
  const deepest = path.at(-1)!;
  return {
    path,
    attention: deepest.workflow.diagram?.attention.includes(deepest.record.state) ?? false,
    waiting: deepest.workflow.waitingStates.includes(deepest.record.state),
  };
}

/**
 * Enters a call: a new child record, numbered by how many times this caller
 * has entered the same state before, so a second entry never reuses the
 * first's history or output.
 */
export function enterCall(record: WorkRecord, site: CallSite, now: Date): WorkRecord {
  const prefix = `${record.id}/${site.state}#`;
  const entered = Object.keys(record.calls ?? {}).filter((id) => id.startsWith(prefix)).length;
  const id = `${prefix}${entered + 1}`;
  const input = site.binding.input?.(record);
  const child = site.newRecord(id, now, input);
  return { ...record, calls: { ...record.calls, [id]: child }, calling: id };
}

/**
 * The caller's workflow, with each call state decided by its callee.
 *
 * A child's move is handed to the engine as a look its caller took without
 * trying, so nothing the callee counts reaches a caller's ceiling, and the
 * caller's own state moves only when the child reaches an end.
 */
export function composedWorkflow(own: Workflow, sites: ReadonlyMap<string, CallSite>): Workflow {
  if (sites.size === 0) return own;
  return {
    ...own,
    calls: Object.fromEntries([...sites].map(([state, site]) => [state, site.workflow])),
    plan: (record, observation, policy) => {
      const site = sites.get(record.state);
      if (!site) return own.plan(record, observation, policy);
      const child = activeCall(record);
      // A record saved in this state before it was a call — an install that
      // upgraded mid-flight — makes its call on its next look.
      if (!child) return Object.assign({ kind: "act", effects: [], why: `${record.id} calls ${site.callee} in ${record.state}`, attempt: false } as Plan, { [ENTER]: true });
      if (site.workflow.terminalStates.includes(child.state)) return returned(site, record, child);
      const inner = site.workflow.plan(child, childObservation(observation), site.runtime?.policy ?? site.policy);
      return carried(child, inner);
    },
  };
}

function returned(site: CallSite, record: WorkRecord, child: WorkRecord): Plan {
  const to = site.edges[child.state]!;
  const say = (site.binding.effects as Record<string, ((work: WorkRecord, out: unknown) => Action[]) | undefined> | undefined)?.[child.state];
  const effects = say ? say(record, site.output(child)) : [];
  const plan: Plan = { kind: "advance", to, effects, why: `${child.id} ended at ${child.state}` };
  return Object.assign(plan, { [RETURNED]: child.id });
}

/** The child's plan as its caller's engine runs it: a look that stays where the caller is. */
function carried(child: WorkRecord, inner: Plan): Plan {
  // A settled child is passed up as it said it, so a decision nobody has
  // written yet (`notWritten`) still reads as one through its caller.
  if (inner.kind === "settled") return inner;
  const why = `${child.id}: ${inner.why}`;
  const plan: Plan = inner.kind === "wait"
    ? { kind: "wait", retryAfterMs: inner.retryAfterMs, effects: inner.effects, why }
    : { kind: "act", effects: inner.effects, why, attempt: false };
  return Object.assign(plan, { [INNER]: inner });
}

function childObservation(observation: unknown): unknown {
  return (observation as Record<string, unknown> | undefined)?.[CALLED];
}

function innerOf(plan: Plan): Plan | undefined {
  return (plan as Plan & { [INNER]?: Plan })[INNER];
}

function returnedFrom(plan: Plan): string | undefined {
  return (plan as Plan & { [RETURNED]?: string })[RETURNED];
}

/**
 * The caller's runtime, with each call state observed, acted on and folded
 * through its callee's.
 *
 * Only the deepest record is observed: a caller in a call state is not asked
 * what its world looks like until its child has ended, and a child that has
 * ended is not asked at all, because the next move is its caller's return.
 */
export function composedRuntime(own: WorkflowRuntime, sites: ReadonlyMap<string, CallSite>, port: PortLookup): WorkflowRuntime {
  if (sites.size === 0) return own;
  const siteOf = (record: WorkRecord): CallSite | undefined => sites.get(record.state);
  const runtimeOf = (site: CallSite): WorkflowRuntime => {
    if (!site.runtime) throw new Error(`the call in \`${site.state}\` to ${site.callee} was never built`);
    return site.runtime;
  };

  return {
    ...own,
    newRecord: (workId, now) => {
      const record = own.newRecord(workId, now);
      const site = siteOf(record);
      return site ? enterCall(record, site, now) : record;
    },
    observe: async (record) => {
      const site = siteOf(record);
      // Looked at again only when its child has ended: that look is the
      // caller's return, and it is the caller's world it returns into.
      const child = site ? activeCall(record) : undefined;
      if (!site || (child && site.workflow.terminalStates.includes(child.state))) return own.observe(record);
      if (!child) return { [CALLED]: undefined };
      return { [CALLED]: await runtimeOf(site).observe(child) };
    },
    actions: composedActions(own, sites, port),
    apply: (record, plan, outcomes, observation, now, moved) => {
      const inner = innerOf(plan);
      const site = siteOf(record);
      if (site && (plan as Plan & { [ENTER]?: true })[ENTER]) return enterCall(record, site, now);
      if (inner && site) return folded(record, site, runtimeOf(site), inner, outcomes, childObservation(observation), now);
      const id = returnedFrom(plan);
      const kept = id === undefined ? record : returnTo(record, sites, id, moved);
      return entering(own.apply(kept, plan, outcomes, observation, now, moved), sites, moved, now);
    },
  };
}

/** One look of the child, folded into its own record and kept inside its caller's. */
function folded(
  record: WorkRecord,
  site: CallSite,
  runtime: WorkflowRuntime,
  inner: Plan,
  outcomes: Record<string, unknown>,
  observation: unknown,
  now: Date,
): WorkRecord {
  const id = record.calling!;
  const child = record.calls![id]!;
  const next = runtime.apply(applyPlan(child, inner, now, outcomes), inner, outcomes, observation, now, movedBy(child, inner));
  return { ...record, calls: { ...record.calls, [id]: next } };
}

/** The caller, holding what the child returned, and waiting on nothing. */
function returnTo(record: WorkRecord, sites: ReadonlyMap<string, CallSite>, id: string, moved: Moved | null): WorkRecord {
  const site = moved ? sites.get(moved.from) : undefined;
  const child = record.calls?.[id];
  if (!site || !child) return record;
  const fold = (site.binding.output as Record<string, ((work: WorkRecord, out: unknown) => WorkRecord) | undefined> | undefined)?.[child.state];
  const kept = fold ? fold(record, site.output(child)) : record;
  const { calling: _calling, ...rest } = kept;
  return rest as WorkRecord;
}

function entering(record: WorkRecord, sites: ReadonlyMap<string, CallSite>, moved: Moved | null, now: Date): WorkRecord {
  const site = moved ? sites.get(moved.to) : undefined;
  return site && record.state === site.state ? enterCall(record, site, now) : record;
}

/**
 * Every action the caller or any callee can plan, each run against the
 * record whose plan carried it.
 *
 * Two workflows may well name an action the same — both announce — so a name
 * a callee plans is a dispatcher that asks whose look this is. One only the
 * caller plans is left exactly as the caller declared it.
 */
function composedActions(own: WorkflowRuntime, sites: ReadonlyMap<string, CallSite>, port: PortLookup): Readonly<Record<string, ActionImplementation>> {
  const actions: Record<string, ActionImplementation> = { ...own.actions };
  const names = new Set<string>();
  for (const site of sites.values()) for (const name of Object.keys(site.runtime?.actions ?? {})) names.add(name);
  for (const name of names) {
    const shared = sharedBinding(own, sites, name);
    if (shared) {
      actions[name] = shared;
      continue;
    }
    actions[name] = async (action: Action, context) => {
      const site = sites.get(context.record.state);
      const child = activeCall(context.record);
      // A child that has ended plans nothing: what runs now is its caller's
      // return, and the effects on that edge are the caller's own.
      const ended = !child || !site || site.workflow.terminalStates.includes(child.state);
      if (!site?.runtime || ended) return runAction(implementationOf(own, name), action, context, port);
      const observation = childObservation(context.observation);
      await runAction(implementationOf(site.runtime, name), action, { record: child, observation, outcomes: context.outcomes }, site.port);
    };
  }
  return actions;
}

/**
 * The port and method every workflow in a call declares for an action, when
 * they all declare the same one and no call rebinds that port: kept as it is
 * rather than wrapped, so the engine can still read what it reaches — the
 * budget asks whether an action spends the agent by the binding it declares.
 */
function sharedBinding(own: WorkflowRuntime, sites: ReadonlyMap<string, CallSite>, name: string): ActionImplementation | undefined {
  const declared = [own, ...[...sites.values()].map((site) => site.runtime!)]
    .map((runtime) => implementationOf(runtime, name))
    .filter((implementation) => implementation !== undefined);
  const [first] = declared;
  if (!isPortBinding(first)) return undefined;
  const same = declared.every((implementation) => isPortBinding(implementation) && implementation.port === first.port && implementation.method === first.method);
  const rebound = [...sites.values()].some((site) => site.binding.ports?.[first.port] !== undefined);
  return same && !rebound ? first : undefined;
}
