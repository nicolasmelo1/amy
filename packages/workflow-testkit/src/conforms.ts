import { Workflow, WorkRecord } from "@amykit/core";
import { conformance } from "./conformance.js";
import { ConformanceError } from "./errors.js";
import { Finding, PROPERTIES, Property } from "./finding.js";
import { ConformanceOptions, World } from "./world.js";

/**
 * The two functions every test runner has.
 *
 * Passed in rather than imported, so the suite runs in whatever the author
 * already uses — `node:test`, vitest, jest — and the kit depends on none of
 * them.
 */
export interface Runner {
  describe(name: string, body: () => void): unknown;
  it(name: string, body: () => Promise<void>): unknown;
}

export interface ConformsOptions<R extends WorkRecord, O, W extends World<R>> extends ConformanceOptions<R, O, W> {
  /** Left out, the runner's globals are used, for a runner that has them. */
  readonly runner?: Runner;
}

/**
 * Registers the machine-shaped suite as ordinary tests: one per property,
 * named for what it claims, red with every finding under it.
 *
 * The worlds are walked once, by whichever test runs first, and every test
 * reads the same report.
 */
export function conforms<R extends WorkRecord, O, P, W extends World<R>>(
  workflow: Workflow<O, P>,
  options: ConformsOptions<R, O, W>,
): void {
  const runner = options.runner ?? globalRunner();
  let report: Promise<Finding[]> | undefined;
  const findings = (): Promise<Finding[]> => (report ??= conformance(workflow, options));

  runner.describe(`${workflow.name} conforms to the machine`, () => {
    for (const property of Object.keys(PROPERTIES) as Property[]) {
      runner.it(PROPERTIES[property], async () => {
        const found = (await findings()).filter((finding) => finding.property === property);
        if (found.length > 0) throw new ConformanceError(property, found);
      });
    }
  });
}

function globalRunner(): Runner {
  const scope = globalThis as { describe?: Runner["describe"]; it?: Runner["it"] };
  if (typeof scope.describe === "function" && typeof scope.it === "function") {
    return { describe: scope.describe, it: scope.it };
  }
  throw new Error(
    "conforms needs a test runner: pass `runner: { describe, it }` from the one you use, " +
      'for example `import { describe, it } from "node:test"`',
  );
}
