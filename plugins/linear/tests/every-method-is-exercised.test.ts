import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testSourcesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the tracker adapter offers is run by something in this suite
 * — the same guardrail the forge carries, on the other port an install
 * cannot run without.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "../src/LinearTracker.ts"), "utf8");
const TESTS = testSourcesIn(here, ["every-method-is-exercised.test.ts"]);

describe("LinearTracker: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(SOURCE, "LinearTracker");

    expect(methods).toContain("inProgress");
    expect(methods).toContain("createFollowUp");
    expect(methods).not.toContain("requireIssue");
  });

  it("finds every method called by some test", () => {
    expect(unexercisedMethods(SOURCE, "LinearTracker", TESTS)).toEqual([]);
  });

  it("turns red, naming the method, when that method's only tests are removed", () => {
    const withoutAssign = TESTS.map((test) => test.replaceAll(".assign(", ".somethingElse("));

    expect(unexercisedMethods(SOURCE, "LinearTracker", withoutAssign)).toEqual(["assign"]);
  });
});
