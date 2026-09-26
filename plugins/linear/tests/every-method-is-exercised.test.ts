import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testFilesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the tracker adapter offers is run by something in this suite
 * — the same guardrail the forge carries, on the other port an install
 * cannot run without.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, "../src/LinearTracker.ts");
const SOURCE = readFileSync(ADAPTER, "utf8");
const QUESTION = {
  adapter: ADAPTER,
  className: "LinearTracker",
  tests: testFilesIn(here, ["every-method-is-exercised.test.ts"]),
  tsconfig: join(here, "../../../tsconfig.tests.json"),
};

// A typed program over the suite is seconds, not milliseconds.
const TYPED = { timeout: 60_000 };

describe("LinearTracker: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(SOURCE, "LinearTracker");

    expect(methods).toContain("inProgress");
    expect(methods).toContain("createFollowUp");
    expect(methods).not.toContain("requireIssue");
  });

  it("finds every method called by some test", TYPED, () => {
    expect(unexercisedMethods(QUESTION)).toEqual([]);
  });

  // `assign` is the name most likely to be called on something else, which
  // is why it is the one removed: an unrelated `fixture.assign(...)` must not
  // stand in for the adapter's.
  it("turns red, naming the method, when its only tests are removed and a namesake remains", TYPED, () => {
    const rewrite = (file: string, text: string) =>
      file.endsWith(".test.ts")
        ? `${text.replaceAll(".assign(", ".somethingElse(")}\nexport const fixture = { assign: (to: string) => to }.assign("ada");\n`
        : text;

    expect(unexercisedMethods({ ...QUESTION, rewrite })).toEqual(["assign"]);
  });
});
