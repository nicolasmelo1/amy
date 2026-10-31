/**
 * A state that calls another workflow, the way code calls a function.
 *
 * The callee runs as a child record kept inside its caller's, with its own
 * id, history and attempts, and only the deepest record in a call is ever
 * observed or decided. See `docs/design/a-workflow-calls-another.md`.
 */

import { PortLookup, implementationOf, isPortBinding, reaching, runAction } from "./dispatch.js";
import { BranchLeases, LeaseHeld } from "./leases.js";
import { ActionContext, ActionImplementation, WorkflowRuntime } from "./runtime.js";
import { Workflow } from "./plugin.js";
import { Worktree } from "./ports/Worktree.js";
import { Action, Lane, Moved, Plan, WorkRecord, applyPlan, looksIn, movedBy } from "./work.js";

const CALL = Symbol.for("@amykit/core/call");
/** The child's own plan, carried on the one its caller's engine is handed. */
const INNER = Symbol.for("@amykit/core/call-inner");
/** The end a child reached, carried on the move its caller makes for it. */
const RETURNED = Symbol.for("@amykit/core/call-returned");
/** A record in a call state that holds no call, entering it now. */
const ENTER = Symbol.for("@amykit/core/call-enter");
/** A record in a fork that started no lanes, starting them now. */
const ENTER_FORK = Symbol.for("@amykit/core/fork-enter");
/** The lane a plan, or an action on it, is a move of. */
const LANE = Symbol.for("@amykit/core/lane");
/** The move to the join, once every lane has ended. */
const JOINED = Symbol.for("@amykit/core/joined");

/**
 * Where a caller's observation keeps its child's.
 *
 * A string rather than a symbol, so a copy of the observation — the testkit
 * keeps one of every look — still carries it.
 */
export const CALLED = "@amykit/called";

/** Where a caller's observation keeps each running lane's, by lane state. */
export const LANED = "@amykit/laned";

/** Where a fork's observation keeps the caller's own world, for what it says before the lanes do. */
const OWN = "@amykit/own";

/**
 * Where the outcome of a look a lane spent waiting on a branch is written:
 * not a try, and looked at again shortly, when the lane holding it may have
 * let it go.
 */
export const LEASE_WAIT = "@amykit/lease-wait";
const LEASE_WAIT_MS = 1_000;

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
  /**
   * The commit the callee checks rather than the base, read-only: a lane that
   * checks the caller's work is lent a tree detached at it. Worked out when
   * the call starts, from the caller's record.
   */
  readonly revision?: (work: R) => string | undefined;
  /**
   * The branch the callee writes, when the call site knows it before
   * anything runs. Two lanes of one fork naming the same one are refused at
   * boot; a branch known only at run time is held to a lease instead.
   */
  readonly branch?: string;
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
  const lanes = laneStanding(deepest.workflow, deepest.record).filter((lane) => !lane.ended);
  if (lanes.length > 0) {
    // A record waiting on lanes needs the person when any lane does, and
    // waits when every lane still running does.
    return { path, attention: lanes.some((lane) => lane.attention), waiting: lanes.every((lane) => lane.waiting) };
  }
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
  const child = newChild(record, site, now);
  return { ...record, calls: { ...record.calls, [child.id]: child }, calling: child.id };
}

/** The callee's new record for one entry into its call state, holding what the binding lends it. */
function newChild(record: WorkRecord, site: CallSite, now: Date): WorkRecord {
  const prefix = `${record.id}/${site.state}#`;
  const entered = Object.keys(record.calls ?? {}).filter((id) => id.startsWith(prefix)).length;
  const id = `${prefix}${entered + 1}`;
  const child = site.newRecord(id, now, site.binding.input?.(record));
  const revision = site.binding.revision?.(record);
  return revision === undefined ? child : { ...child, revision };
}

/** A fork as the mount put it together: its lanes, each a call, and where they meet. */
export interface ForkSite {
  readonly state: string;
  readonly join: string;
  readonly lanes: readonly CallSite[];
  /** The branches its lanes hold, let go of as each one ends. */
  readonly leases?: BranchLeases;
  /**
   * The commit each running lane was lent, by the lane record's id, read by
   * the lanes' checkouts: a lane bound with `revision` is handed a tree
   * detached at it whatever it asks for, and every move there is refused.
   */
  readonly lent?: Map<string, string>;
}

/**
 * Enters a fork: every lane's callee starts at once, each a record of its own
 * with its own input, numbered like any call so a second round never reuses
 * the first's.
 */
function enterFork(record: WorkRecord, fork: ForkSite, now: Date): WorkRecord {
  let entered = record;
  const lanes: Record<string, Lane> = {};
  for (const site of fork.lanes) {
    const child = newChild(entered, site, now);
    entered = { ...entered, calls: { ...entered.calls, [child.id]: child } };
    lanes[site.state] = { call: child.id };
  }
  return { ...entered, lanes };
}

/** The lane's own record, or undefined for a lane this record never started. */
function laneRecord(record: WorkRecord, lane: string): WorkRecord | undefined {
  const call = record.lanes?.[lane]?.call;
  return call === undefined ? undefined : record.calls?.[call];
}

function hasEnded(site: CallSite, child: WorkRecord | undefined): boolean {
  return !!child && site.workflow.terminalStates.includes(child.state);
}

/** Whether a record in this fork has started every one of its lanes. */
function started(fork: ForkSite, record: WorkRecord): boolean {
  return fork.lanes.every((site) => laneRecord(record, site.state) !== undefined);
}

/** The lanes still running, in the order the next look takes them: the one whose turn it is first. */
function inTurn(fork: ForkSite, record: WorkRecord): CallSite[] {
  const running = fork.lanes.filter((site) => !hasEnded(site, laneRecord(record, site.state)));
  if (running.length === 0) return running;
  const first = looksIn(record, fork.state) % running.length;
  return [...running.slice(first), ...running.slice(0, first)];
}

/** Where one lane stands, as its caller says it. */
export interface LaneStanding {
  readonly lane: string;
  readonly record: WorkRecord;
  readonly ended: boolean;
  /** The lane, at its deepest call, waits on the person whose work it is. */
  readonly attention: boolean;
  readonly waiting: boolean;
}

/**
 * Every lane of the fork a record waits in, and where each stands; empty for
 * a record that is not in a fork. What the join says while it waits: which
 * lanes have arrived, and which one needs the person.
 */
export function laneStanding(workflow: Workflow, record: WorkRecord): LaneStanding[] {
  const fork = workflow.diagram?.forks[record.state];
  if (!fork) return [];
  return fork.lanes.flatMap((lane) => {
    const child = laneRecord(record, lane);
    const callee = workflow.calls?.[lane];
    if (!child || !callee) return [];
    const standing = callStanding(callee, child);
    return [{ lane, record: child, ended: callee.terminalStates.includes(child.state), attention: standing.attention, waiting: standing.waiting }];
  });
}

/**
 * The caller's workflow, with each call state decided by its callee.
 *
 * A child's move is handed to the engine as a look its caller took without
 * trying, so nothing the callee counts reaches a caller's ceiling, and the
 * caller's own state moves only when the child reaches an end.
 */
export function composedWorkflow(own: Workflow, sites: ReadonlyMap<string, CallSite>, forks: ReadonlyMap<string, ForkSite> = new Map()): Workflow {
  if (sites.size === 0) return own;
  return {
    ...own,
    calls: Object.fromEntries([...sites].map(([state, site]) => [state, site.workflow])),
    everyLane: (record, observation, policy) => everyLaneThrough(own, sites, forks, record, observation, policy),
    plan: (record, observation, policy) => {
      const fork = forks.get(record.state);
      if (fork) return own.interrupt?.(record, ownObservation(observation), policy) ?? forkPlan(fork, record, observation);
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

function laneObservation(observation: unknown, lane: string): unknown {
  return ((observation as Record<string, unknown> | undefined)?.[LANED] as Record<string, unknown> | undefined)?.[lane];
}

/**
 * The next move of a record waiting in a fork: start the lanes, move the
 * lane whose turn it is, or go to the join once every lane has ended.
 *
 * One move per look, as anywhere else. A lane that waits gives its turn to
 * the next, so a lane that escalates never holds its siblings up; only when
 * every lane still running waits does the record wait, saying which lanes
 * have arrived and which one needs the person.
 */
function forkPlan(fork: ForkSite, record: WorkRecord, observation: unknown): Plan {
  if (!started(fork, record)) {
    return Object.assign({ kind: "act", effects: [], why: `${record.id} starts the lanes of ${fork.state}`, attempt: false } as Plan, { [ENTER_FORK]: true });
  }
  const running = inTurn(fork, record);
  if (running.length === 0) return joined(fork, record);
  const moves = running.map((site) => laneMove(site, record, observation));
  // A lane whose decision is not written yet settles; its siblings still
  // move, and the record settles on it only once nothing else can.
  const moving = moves.find((move) => move.kind !== "wait" && move.kind !== "settled");
  if (moving) return moving;
  const settled = moves.find((move) => move.kind === "settled");
  if (settled) return settled;
  const soonest = Math.min(...moves.map((move) => (move.kind === "wait" ? move.retryAfterMs : 0)));
  const first = moves[0] as Extract<Plan, { kind: "wait" }>;
  return Object.assign({ ...first, retryAfterMs: soonest, why: `every lane of ${fork.state} waits — ${arrivals(fork, record, moves)}` }, { [LANE]: laneOf(first), [INNER]: innerOf(first) });
}

/**
 * Every move the lanes can make on this look — of the fork the record waits
 * in, or of one inside the call it is in, at any depth — or undefined when
 * there are not two, or the workflow has something to say first.
 */
function everyLaneThrough(
  own: Workflow,
  sites: ReadonlyMap<string, CallSite>,
  forks: ReadonlyMap<string, ForkSite>,
  record: WorkRecord,
  observation: unknown,
  policy: unknown,
): readonly Plan[] | undefined {
  if (forks.has(record.state)) {
    return own.interrupt?.(record, ownObservation(observation), policy) ? undefined : everyLane(forks, record, observation);
  }
  const site = sites.get(record.state);
  const child = activeCall(record);
  if (!site || !child || site.workflow.terminalStates.includes(child.state)) return undefined;
  const moves = site.workflow.everyLane?.(child, childObservation(observation), site.runtime?.policy ?? site.policy);
  return moves?.map((move) => carried(child, move));
}

/** The caller's own world in a fork's observation — which, once every lane has ended, is all it holds. */
function ownObservation(observation: unknown): unknown {
  const held = observation as Record<string, unknown> | undefined;
  return held && Object.hasOwn(held, OWN) ? held[OWN] : observation;
}

/** Every move the lanes of a fork can make on this look, one per lane that is not waiting, for an engine that moves them side by side. */
function everyLane(forks: ReadonlyMap<string, ForkSite>, record: WorkRecord, observation: unknown): readonly Plan[] | undefined {
  const fork = forks.get(record.state);
  if (!fork || !started(fork, record)) return undefined;
  const moves = inTurn(fork, record).map((site) => laneMove(site, record, observation));
  const moving = moves.filter((move) => move.kind !== "wait" && move.kind !== "settled");
  return moving.length > 1 ? moving : undefined;
}

/** One lane's own plan, as its caller's engine runs it, every action on it marked as the lane's. */
function laneMove(site: CallSite, record: WorkRecord, observation: unknown): Plan {
  const child = laneRecord(record, site.state)!;
  const inner = site.workflow.plan(child, laneObservation(observation, site.state), site.runtime?.policy ?? site.policy);
  const plan = carried(child, inner);
  if (plan.kind === "settled") return plan;
  const effects = plan.effects.map((effect) => Object.assign({ ...effect }, { [LANE]: site.state }));
  return Object.assign({ ...plan, effects }, { [INNER]: inner, [LANE]: site.state });
}

/** The move to the join, carrying what each lane's binding says on the way out. */
function joined(fork: ForkSite, record: WorkRecord): Plan {
  const effects: Action[] = [];
  const ends: string[] = [];
  for (const site of fork.lanes) {
    const child = laneRecord(record, site.state)!;
    ends.push(`${site.state} at ${child.state}`);
    const say = (site.binding.effects as Record<string, ((work: WorkRecord, out: unknown) => Action[]) | undefined> | undefined)?.[child.state];
    if (say) effects.push(...say(record, site.output(child)));
  }
  const plan: Plan = { kind: "advance", to: fork.join, effects, why: `every lane of ${fork.state} has ended: ${ends.join(", ")}` };
  return Object.assign(plan, { [JOINED]: fork.state });
}

/** Which lanes have arrived, and what each one still running is waiting on. */
function arrivals(fork: ForkSite, record: WorkRecord, moves: readonly Plan[]): string {
  const ended = fork.lanes.filter((site) => hasEnded(site, laneRecord(record, site.state)));
  const arrived = `${ended.length} of ${fork.lanes.length} arrived${ended.length > 0 ? ` (${ended.map((site) => site.state).join(", ")})` : ""}`;
  const waiting = moves.map((move) => {
    const site = fork.lanes.find((candidate) => candidate.state === laneOf(move))!;
    const child = laneRecord(record, site.state)!;
    const attention = site.workflow.diagram?.attention.includes(child.state) ?? false;
    return `${site.state} ${attention ? "needs the person" : "waits"} in ${child.state}`;
  });
  return [arrived, ...waiting].join("; ");
}

function laneOf(value: object): string | undefined {
  return (value as { [LANE]?: string })[LANE];
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
export function composedRuntime(own: WorkflowRuntime, sites: ReadonlyMap<string, CallSite>, port: PortLookup, forks: ReadonlyMap<string, ForkSite> = new Map()): WorkflowRuntime {
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
      const fork = forks.get(record.state);
      if (fork) return observeFork(own, fork, record, runtimeOf, port);
      const site = siteOf(record);
      // Looked at again only when its child has ended: that look is the
      // caller's return, and it is the caller's world it returns into.
      const child = site ? activeCall(record) : undefined;
      if (!site || (child && site.workflow.terminalStates.includes(child.state))) return own.observe(record);
      if (!child) return { [CALLED]: undefined };
      return { [CALLED]: await runtimeOf(site).observe(child) };
    },
    actions: composedActions(own, sites, port, forks),
    apply: (record, plan, outcomes, observation, now, moved) => {
      const inner = innerOf(plan);
      const lane = laneOf(plan);
      const fork = forks.get(record.state);
      if (fork && (plan as Plan & { [ENTER_FORK]?: true })[ENTER_FORK]) return enterFork(record, fork, now);
      if (fork && lane && inner) return foldedLane(record, fork, lane, runtimeOf, inner, outcomes, laneObservation(observation, lane), now);
      const site = siteOf(record);
      if (site && (plan as Plan & { [ENTER]?: true })[ENTER]) return enterCall(record, site, now);
      if (inner && site) return folded(record, site, runtimeOf(site), inner, outcomes, childObservation(observation), now);
      return ownMove(own, sites, forks, { record, plan, outcomes, observation, now, moved });
    },
  };
}

/**
 * A move the caller makes itself: back from a call, on from the join, or out
 * of a fork interrupted before its lanes met — whose lanes still running stop
 * where they are and let go of the branches they held.
 */
function ownMove(
  own: WorkflowRuntime,
  sites: ReadonlyMap<string, CallSite>,
  forks: ReadonlyMap<string, ForkSite>,
  look: { record: WorkRecord; plan: Plan; outcomes: Record<string, unknown>; observation: unknown; now: Date; moved: Moved | null },
): WorkRecord {
  const { record, plan, outcomes, now, moved } = look;
  const id = returnedFrom(plan);
  const from = (plan as Plan & { [JOINED]?: string })[JOINED];
  const left = moved ? forks.get(moved.from) : undefined;
  if (left && from === undefined) for (const lane of Object.values(record.lanes ?? {})) left.leases?.release(lane.call);
  const kept = id !== undefined ? returnTo(record, sites, id, moved) : from !== undefined ? joinedInto(record, forks.get(from)!) : record;
  // Out of a fork, the caller folds its own world, not the lanes'.
  const observation = left ? ownObservation(look.observation) : look.observation;
  return entering(own.apply(kept, plan, outcomes, observation, now, moved), sites, forks, moved, now);
}

/**
 * What a record waiting in a fork is shown: each running lane's own world,
 * by lane — or, once every lane has ended, the caller's, since that look is
 * its move to the join. The trees the lanes were lent go back then.
 */
async function observeFork(
  own: WorkflowRuntime,
  fork: ForkSite,
  record: WorkRecord,
  runtimeOf: (site: CallSite) => WorkflowRuntime,
  port: PortLookup,
): Promise<unknown> {
  if (!started(fork, record)) return { [LANED]: {}, [OWN]: await own.observe(record) };
  const running = inTurn(fork, record);
  if (running.length === 0) {
    await returnTrees(fork, record, port("worktree") as Worktree | undefined);
    return own.observe(record);
  }
  const seen = await Promise.all(running.map(async (site) => [site.state, await runtimeOf(site).observe(laneRecord(record, site.state)!)] as const));
  // The caller's own world too, so what it says before any decision — a
  // ticket that left the working status — is heard while its lanes run.
  return { [LANED]: Object.fromEntries(seen), [OWN]: await own.observe(record) };
}

/**
 * Removes the trees the lanes of an ended fork were lent. A lane checks; it
 * keeps nothing in its tree worth keeping once it has ended, and a fork run
 * every round would otherwise leave two trees behind each time.
 */
async function returnTrees(fork: ForkSite, record: WorkRecord, worktree: Worktree | undefined): Promise<void> {
  if (!worktree) return;
  const ids = new Set(fork.lanes.map((site) => record.lanes?.[site.state]?.call));
  for (const tree of await worktree.states()) {
    if (ids.has(tree.workId)) await worktree.release(tree.workId, tree.repo, { force: true });
  }
}

/** One look of a lane, folded into its own record; a lane that has ended lets go of the branches it held. */
function foldedLane(
  record: WorkRecord,
  fork: ForkSite,
  lane: string,
  runtimeOf: (site: CallSite) => WorkflowRuntime,
  inner: Plan,
  outcomes: Record<string, unknown>,
  observation: unknown,
  now: Date,
): WorkRecord {
  const site = fork.lanes.find((candidate) => candidate.state === lane)!;
  const child = laneRecord(record, lane)!;
  // A lane that waited on a branch made no move, whatever its plan said:
  // it looked, it stays where it is, and nothing it planned is folded.
  if (outcomes[LEASE_WAIT]) {
    const waited: Plan = { kind: "wait", retryAfterMs: LEASE_WAIT_MS, effects: [], why: "waiting on a branch another lane holds" };
    return { ...record, calls: { ...record.calls, [child.id]: applyPlan(child, waited, now) } };
  }
  const next = runtimeOf(site).apply(applyPlan(child, inner, now, outcomes), inner, outcomes, observation, now, movedBy(child, inner));
  // Every branch the lane took goes back with it, those its own calls took included.
  if (hasEnded(site, next)) {
    fork.leases?.release(next.id);
    fork.lent?.delete(next.id);
  }
  return { ...record, calls: { ...record.calls, [next.id]: next } };
}

/**
 * The caller at its join, holding where each lane ended and what it
 * returned, keyed by lane, with each binding's fold applied in the order the
 * lanes are drawn.
 */
function joinedInto(record: WorkRecord, fork: ForkSite): WorkRecord {
  let kept = record;
  const lanes: Record<string, Lane> = {};
  for (const site of fork.lanes) {
    const child = laneRecord(record, site.state)!;
    const output = site.output(child);
    lanes[site.state] = { call: child.id, end: child.state, ...(output === undefined ? {} : { output }) };
    const fold = (site.binding.output as Record<string, ((work: WorkRecord, out: unknown) => WorkRecord) | undefined> | undefined)?.[child.state];
    if (fold) kept = fold(kept, output);
  }
  return { ...kept, lanes };
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

function entering(record: WorkRecord, sites: ReadonlyMap<string, CallSite>, forks: ReadonlyMap<string, ForkSite>, moved: Moved | null, now: Date): WorkRecord {
  if (!moved || record.state !== moved.to) return record;
  const fork = forks.get(moved.to);
  if (fork) return enterFork(record, fork, now);
  const site = sites.get(moved.to);
  return site ? enterCall(record, site, now) : record;
}

/**
 * Every action the caller or any callee can plan, each run against the
 * record whose plan carried it.
 *
 * Two workflows may well name an action the same — both announce — so a name
 * a callee plans is a dispatcher that asks whose look this is. One only the
 * caller plans is left exactly as the caller declared it.
 */
function composedActions(own: WorkflowRuntime, sites: ReadonlyMap<string, CallSite>, port: PortLookup, forks: ReadonlyMap<string, ForkSite>): Readonly<Record<string, ActionImplementation>> {
  const actions: Record<string, ActionImplementation> = { ...own.actions };
  const names = new Set<string>();
  for (const site of sites.values()) for (const name of Object.keys(site.runtime?.actions ?? {})) names.add(name);
  // A lane's action runs against the lane's record, never the caller's, so it
  // is always dispatched rather than handed to the port as declared.
  const laned = new Set([...forks.values()].flatMap((fork) => fork.lanes.flatMap((site) => Object.keys(site.runtime?.actions ?? {}))));
  for (const name of names) {
    const shared = laned.has(name) ? undefined : sharedBinding(own, sites, name);
    if (shared) {
      actions[name] = shared;
      continue;
    }
    actions[name] = reaching(async (action: Action, context: ActionContext) => {
      const lane = laneOf(action);
      const fork = forks.get(context.record.state);
      if (fork && lane) return laneAction(fork, lane, name, action, context);
      const site = sites.get(context.record.state);
      const child = activeCall(context.record);
      // A child that has ended plans nothing: what runs now is its caller's
      // return, and the effects on that edge are the caller's own.
      const ended = !child || !site || site.workflow.terminalStates.includes(child.state);
      if (!site?.runtime || ended) return runAction(implementationOf(own, name), action, context, port);
      const observation = childObservation(context.observation);
      await runAction(implementationOf(site.runtime, name), action, { record: child, observation, outcomes: context.outcomes }, site.port);
    }, laneSpends(forks, name));
  }
  return actions;
}

/**
 * The port a lane's action spends, when every lane declaring it binds it to
 * the same one: the dispatcher still says so, so the budget is asked before
 * a lane spends the agent as before any other move.
 */
function laneSpends(forks: ReadonlyMap<string, ForkSite>, name: string): string | undefined {
  const ports = new Set([...forks.values()].flatMap((fork) => fork.lanes.flatMap((site) => {
    const implementation = site.runtime && implementationOf(site.runtime, name);
    if (implementation === undefined) return [];
    return [isPortBinding(implementation) ? site.binding.ports?.[implementation.port] ?? implementation.port : ""];
  })));
  return ports.size === 1 ? [...ports][0] || undefined : undefined;
}

/**
 * One action of one lane, run against the lane's own record and world.
 *
 * A lane that asks for a branch another lane holds has not tried anything:
 * the look is written down as one that waited, and the rest of the lane's
 * plan is not run on top of a branch it never got.
 */
async function laneAction(fork: ForkSite, lane: string, name: string, action: Action, context: ActionContext): Promise<void> {
  if (context.outcomes[LEASE_WAIT]) return;
  const site = fork.lanes.find((candidate) => candidate.state === lane)!;
  const child = laneRecord(context.record, lane)!;
  if (child.revision !== undefined) fork.lent?.set(child.id, child.revision);
  try {
    await runAction(implementationOf(site.runtime!, name), action, { record: child, observation: laneObservation(context.observation, lane), outcomes: context.outcomes }, site.port);
  } catch (error) {
    if (!(error instanceof LeaseHeld)) throw error;
    context.outcomes[LEASE_WAIT] = { notATry: true, retryAfterMs: LEASE_WAIT_MS, held: error.message };
  }
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
