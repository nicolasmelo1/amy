import { Plan, Workflow, WorkflowRuntime, WorkRecord, actionsOf, applyPlan } from "@amykit/core";
import { Finding, Property, message } from "./finding.js";
import { Clock, World } from "./world.js";

/** The workflow and its runtime with their types let go of, which is all a walk needs. */
export type AnyWorkflow = Workflow<unknown, unknown>;
export type AnyRuntime = WorkflowRuntime<WorkRecord, unknown>;

/** One look the machine took: what it saw, and what it decided. */
export interface Look {
  readonly record: WorkRecord;
  readonly observation: unknown;
  readonly plan: Plan;
  /** The kit's clock when the look was taken. */
  readonly at: Date;
  /** Whether any `meanwhile` ran since the record entered the state it is in. */
  readonly worldMoved: boolean;
}

export interface Walk {
  readonly world: string;
  /** The runtime this world was walked with, for the probes that replay a look. */
  readonly runtime: AnyRuntime | undefined;
  /** True when the record came from the runtime's own `newRecord`. */
  readonly fromTheStart: boolean;
  readonly looks: readonly Look[];
  readonly findings: readonly Finding[];
}

export interface WalkOptions {
  readonly runtime: (world: World, now: () => Date) => AnyRuntime;
  readonly maxLooks: number;
  readonly start: Date;
}

/**
 * Drives one world the way the engine drives a queue item, one look at a
 * time, until the work settles, waits with nothing left to happen, fails, or
 * spins.
 *
 * Every action a plan carries is *called*, against the observation the
 * runtime really built. That is the difference between this and asking
 * whether a handler exists: a handler that reads a field the observation no
 * longer has exists, and throws on the first real piece of work.
 */
export async function walk(workflow: AnyWorkflow, world: World, options: WalkOptions): Promise<Walk> {
  const clock = new Clock(options.start);
  const findings: Finding[] = [];
  const looks: Look[] = [];
  const fail = (property: Property, said: string): void => {
    findings.push({ property, message: `${world.name}: ${said}` });
  };
  const done = (runtime: AnyRuntime | undefined, fromTheStart: boolean): Walk => ({
    world: world.name, runtime, fromTheStart, looks, findings,
  });

  const runtime = attempt(() => options.runtime(world, clock.now), (error) => fail("walk", `the runtime could not be built — ${error}`));
  if (!runtime) return done(undefined, false);

  const fromTheStart = !world.start;
  const record = attempt(
    () => world.start?.(clock.now()) ?? runtime.newRecord(world.workId ?? world.name, clock.now()),
    (error) => fail("walk", `the first record could not be made — ${error}`),
  );
  if (!record) return done(runtime, fromTheStart);
  if (fromTheStart && record.state !== workflow.initialState) {
    fail("reachability", `newRecord starts at \`${record.state}\`, not at the initial state \`${workflow.initialState}\``);
  }

  await drive(workflow, runtime, record, { world, clock, looks, fail, maxLooks: options.maxLooks });
  return done(runtime, fromTheStart);
}

interface Drive {
  readonly world: World;
  readonly clock: Clock;
  readonly looks: Look[];
  readonly fail: (property: Property, said: string) => void;
  readonly maxLooks: number;
}

/** The looks themselves, from the first record until the walk comes to rest. */
async function drive(workflow: AnyWorkflow, runtime: AnyRuntime, first: WorkRecord, walk: Drive): Promise<void> {
  const pending = [...(walk.world.meanwhile ?? [])];
  let record = first;
  let worldMoved = false;

  for (let count = 0; count < walk.maxLooks; count += 1) {
    const look = await lookOnce(workflow, runtime, record, walk.clock, worldMoved, walk.fail);
    if (!look) return;
    walk.looks.push(look.look);
    const plan = look.look.plan;
    if (plan.kind === "settled") return;

    if (look.next.state !== record.state) worldMoved = false;
    record = look.next;

    if (plan.kind !== "wait") {
      walk.clock.pass(1000);
      continue;
    }
    // The world only moves while the machine waits, and only as far as the
    // author said it would. A wait with nothing left to happen is where this
    // world ends, which is not a failure: it is a question for the other
    // worlds, whether any of them gets the work out of here.
    const next = pending.shift();
    if (!next) return;
    walk.clock.pass(plan.retryAfterMs);
    if (!(await meanwhile(next, walk.fail))) return;
    worldMoved = true;
  }

  walk.fail("reachability", `did not come to rest within ${walk.maxLooks} looks; it was last in \`${record.state}\``);
}

async function meanwhile(step: () => void | Promise<void>, fail: (property: Property, said: string) => void): Promise<boolean> {
  try {
    await step();
    return true;
  } catch (error) {
    fail("walk", `a \`meanwhile\` step threw — ${message(error)}`);
    return false;
  }
}

async function lookOnce(
  workflow: AnyWorkflow,
  runtime: AnyRuntime,
  record: WorkRecord,
  clock: Clock,
  worldMoved: boolean,
  fail: (property: Property, said: string) => void,
): Promise<{ look: Look; next: WorkRecord } | undefined> {
  const at = clock.now();
  let observation: unknown;
  try {
    observation = await runtime.observe(record);
  } catch (error) {
    fail("walk", `observing \`${record.state}\` threw — ${message(error)}`);
    return undefined;
  }

  const plan = attempt(
    () => workflow.plan(record, observation, runtime.policy),
    (error) => fail("walk", `planning \`${record.state}\` threw — ${error}`),
  );
  if (!plan) return undefined;
  const look: Look = { record, observation: snapshot(observation), plan, at, worldMoved };

  if (plan.kind === "advance" && !workflow.states.includes(plan.to)) {
    fail("reachability", `\`${record.state}\` moves to \`${plan.to}\`, which the workflow does not declare`);
    return undefined;
  }

  const outcomes = await run(runtime, look, observation, fail);
  if (!outcomes) return undefined;
  if (plan.kind === "settled") return { look, next: record };

  const next = attempt(
    () => runtime.apply(applyPlan(record, plan, at), plan, outcomes, observation, at),
    (error) => fail("walk", `folding a look in \`${record.state}\` threw — ${error}`),
  );
  return next ? { look, next } : undefined;
}

/** Calls every action a plan carries, the way the engine would, and keeps what they produced. */
async function run(
  runtime: AnyRuntime,
  look: Look,
  observation: unknown,
  fail: (property: Property, said: string) => void,
): Promise<Record<string, unknown> | undefined> {
  const outcomes: Record<string, unknown> = {};
  const handlers = runtime.handlers();
  const state = look.record.state;

  for (const action of actionsOf(look.plan)) {
    const handler = handlers[action.type];
    if (!handler) {
      fail("handlers", `\`${state}\` plans \`${action.type}\`, and nothing in the runtime handles it`);
      return undefined;
    }
    try {
      await handler(action, { record: look.record, observation, outcomes });
    } catch (error) {
      fail("handlers", `\`${action.type}\` threw when \`${state}\` called it — ${message(error)}`);
      return undefined;
    }
  }
  return outcomes;
}

/**
 * The observation as it was when the look was taken, for the probes that
 * replay it.
 *
 * A fake port may hand back the very object a `meanwhile` goes on to change,
 * and a look replayed later has to see what the machine saw then, not what
 * the world became. The walk itself decides and acts on the observation it
 * was given; only a replay reads the copy, and one that cannot be copied —
 * it carries a function — is kept as it is.
 */
function snapshot(observation: unknown): unknown {
  try {
    return structuredClone(observation);
  } catch {
    return observation;
  }
}

function attempt<T>(body: () => T, failed: (error: string) => void): T | undefined {
  try {
    return body();
  } catch (error) {
    failed(message(error));
    return undefined;
  }
}
