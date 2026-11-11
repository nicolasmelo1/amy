import { Workflow, WorkRecord } from "@amykit/core";
import { CalledPair, called, calledId } from "./called.js";
import { ceilings } from "./ceilings.js";
import { escalation } from "./escalation.js";
import { Finding, PROPERTIES, Property, distinct } from "./finding.js";
import { folds } from "./folds.js";
import { handlers } from "./handlers.js";
import { reachability } from "./reachability.js";
import { transitions } from "./transitions.js";
import { AnyRuntime, AnyWorkflow, Walk, WalkOptions, walk } from "./walk.js";
import { ConformanceOptions, World } from "./world.js";

/** A Thursday, so a roster that is only confirmed on workdays is confirmed. */
const THURSDAY_NOON = new Date("2026-09-03T12:00:00.000Z");

/**
 * Walks every world and asks the machine-shaped questions of what it saw.
 *
 * Returns what failed rather than throwing, so a caller can assert on one
 * finding; `conforms` is the version that becomes tests.
 */
export async function conformance<R extends WorkRecord, O, P, W extends World<R>>(
  workflow: Workflow<O, P>,
  options: ConformanceOptions<R, O, W>,
): Promise<Finding[]> {
  const machine = workflow as unknown as AnyWorkflow;
  if (options.worlds.length === 0) {
    return [{ property: "walk", message: "no world was given, so nothing was walked" }];
  }

  const walking = {
    runtime: (w: World, now: () => Date) => options.runtime(w as W, now) as unknown as AnyRuntime,
    ports: (w: World) => options.ports?.(w as W) ?? {},
    maxLooks: options.maxLooks ?? 200,
    start: options.start ?? THURSDAY_NOON,
  };
  const walks = [];
  const pairs: CalledPair[] = [];
  for (const world of options.worlds) {
    const alone = await walk(machine, world, walking);
    walks.push(alone);
    pairs.push(await walkedCalled(machine, world, alone, walking));
  }

  const extraLooks = options.extraLooks ?? 10;
  const spent = await ceilings(machine, walks, extraLooks);
  return distinct([
    ...walks.flatMap((w) => w.findings),
    ...reachability(machine, walks),
    ...handlers(machine, walks),
    ...spent,
    ...folds(machine, walks),
    ...escalation(machine, walks, options.givesUp ?? []),
    ...transitions(machine, walks, options.everyEdge ?? false),
    // What broke only under a call is reported under the world it broke in.
    ...pairs.flatMap((pair) => onlyCalled(pair).map((finding) => ({ ...finding, message: `called as \`${calledId(pair.unit)}\`, ${finding.message}` }))),
    ...called(pairs),
  ]).sort((a, b) => order(a.property) - order(b.property));
}

/**
 * The same world again, as a phase another workflow calls: its record's id is
 * the call's, and the unit it is for is the world's own work.
 */
async function walkedCalled(machine: AnyWorkflow, world: World, alone: Walk, walking: WalkOptions): Promise<CalledPair> {
  const saidAlone = [...(world.said?.() ?? [])];
  const unit = world.workId ?? world.name;
  const again = (await world.again?.()) ?? world;
  const before = again.said?.().length ?? 0;
  const called = await walk(machine, again, { ...walking, calledAs: calledId(unit) });
  return { world: world.name, unit, alone, called, saidAlone, saidCalled: (again.said?.() ?? []).slice(before) };
}

/** What the walk called as a phase found that the one standing alone did not: the rest is already said. */
function onlyCalled(pair: CalledPair): Finding[] {
  const alone = new Set(pair.alone.findings.map((finding) => `${finding.property}\u0000${finding.message}`));
  return pair.called.findings.filter((finding) => !alone.has(`${finding.property}\u0000${finding.message}`));
}

function order(property: Property): number {
  return Object.keys(PROPERTIES).indexOf(property);
}
