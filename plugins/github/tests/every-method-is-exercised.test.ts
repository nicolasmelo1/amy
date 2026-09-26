import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testSourcesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the forge adapter offers is run by something in this suite.
 *
 * `reviewsRequestedOf` shipped broken because nothing a workflow ran called
 * it: its first consumer was a private install, in production. A method
 * nothing exercises is a capability the port claims and has not proven, so
 * a new one reaches this test red until something calls it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "../src/GitHubCodeHost.ts"), "utf8");
const TESTS = testSourcesIn(here, ["every-method-is-exercised.test.ts"]);

describe("GitHubCodeHost: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(SOURCE, "GitHubCodeHost");

    expect(methods).toContain("reviewsRequestedOf");
    expect(methods).toContain("findPullRequest");
    // Private helpers are not the port's, and are proven through the methods that call them.
    expect(methods).not.toContain("graphql");
    expect(methods).not.toContain("constructor");
  });

  it("finds every method called by some test", () => {
    expect(unexercisedMethods(SOURCE, "GitHubCodeHost", TESTS)).toEqual([]);
  });

  // The property the guardrail exists for: take a method's tests away and
  // the guardrail names it.
  it("turns red, naming the method, when that method's only tests are removed", () => {
    const withoutReviewLoad = TESTS.map((test) => test.replaceAll(".reviewLoad(", ".somethingElse("));

    expect(unexercisedMethods(SOURCE, "GitHubCodeHost", withoutReviewLoad)).toEqual(["reviewLoad"]);
  });

  it("turns red, naming the method, when a method arrives with nothing calling it", () => {
    const withNewMethod = SOURCE.replace(
      /^export class GitHubCodeHost implements CodeHost \{\n/m,
      (opening) => `${opening}  async closePullRequest(repo: string, number: number): Promise<void> {}\n`,
    );

    expect(unexercisedMethods(withNewMethod, "GitHubCodeHost", TESTS)).toEqual(["closePullRequest"]);
  });
});
