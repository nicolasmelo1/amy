import { Workflow, WorkRecord } from "@amykit/core";
import { ceilings } from "./ceilings.js";
import { escalation } from "./escalation.js";
import { Finding, PROPERTIES, Property, distinct } from "./finding.js";
import { folds } from "./folds.js";
import { handlers } from "./handlers.js";
import { reachability } from "./reachability.js";
import { AnyRuntime, AnyWorkflow, walk } from "./walk.js";
import { ConformanceOptions, World } from "./world.js";

/** A Thursday, so a roster that is only confirmed on workdays is confirmed. */
const THURSDAY_NOON = new Date("2026-09-03T12:00:00.000Z");

/**
 * Walks every world and asks the five machine-shaped questions of what it saw.
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

  const walks = [];
  for (const world of options.worlds) {
    walks.push(
      await walk(machine, world, {
        runtime: (w, now) => options.runtime(w as W, now) as unknown as AnyRuntime,
        maxLooks: options.maxLooks ?? 200,
        start: options.start ?? THURSDAY_NOON,
      }),
    );
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
  ]).sort((a, b) => order(a.property) - order(b.property));
}

function order(property: Property): number {
  return Object.keys(PROPERTIES).indexOf(property);
}
