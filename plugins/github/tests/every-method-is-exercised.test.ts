import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testFilesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the forge adapter offers is run by something in this suite.
 *
 * `reviewsRequestedOf` shipped broken because nothing a workflow ran called
 * it: its first consumer was a private install, in production. A method
 * nothing exercises is a capability the port claims and has not proven, so
 * a new one reaches this test red until something calls it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, "../src/GitHubCodeHost.ts");
const SOURCE = readFileSync(ADAPTER, "utf8");
const QUESTION = {
  adapter: ADAPTER,
  className: "GitHubCodeHost",
  tests: testFilesIn(here, ["every-method-is-exercised.test.ts"]),
  tsconfig: join(here, "../../../tsconfig.tests.json"),
};
const inTests = (edit: (text: string) => string) => (file: string, text: string) =>
  file.endsWith(".test.ts") ? edit(text) : text;

// A typed program over the suite is seconds, not milliseconds.
const TYPED = { timeout: 60_000 };

describe("GitHubCodeHost: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(SOURCE, "GitHubCodeHost");

    expect(methods).toContain("reviewsRequestedOf");
    expect(methods).toContain("findPullRequest");
    // Private helpers are not the port's, and are proven through the methods that call them.
    expect(methods).not.toContain("graphql");
    expect(methods).not.toContain("constructor");
  });

  it("finds every method called by some test", TYPED, () => {
    expect(unexercisedMethods(QUESTION)).toEqual([]);
  });

  // The property the guardrail exists for: take a method's tests away and
  // the guardrail names it.
  it("turns red, naming the method, when that method's only tests are removed", TYPED, () => {
    const rewrite = inTests((text) => text.replaceAll(".reviewLoad(", ".somethingElse("));

    expect(unexercisedMethods({ ...QUESTION, rewrite })).toEqual(["reviewLoad"]);
  });

  it("does not count the name in a comment, a string, or on some other object", TYPED, () => {
    const rewrite = inTests(
      (text) =>
        `${text.replaceAll(".reviewLoad(", ".somethingElse(")}\n` +
        `// host.reviewLoad(["a/b"]) is what this would call\n` +
        `export const named = "host.reviewLoad(";\n` +
        `export const other = { reviewLoad: (repos: string[]) => repos.length }.reviewLoad(["a/b"]);\n`,
    );

    expect(unexercisedMethods({ ...QUESTION, rewrite })).toEqual(["reviewLoad"]);
  });

  it("turns red, naming the method, when a method arrives with nothing calling it", TYPED, () => {
    const rewrite = (file: string, text: string) =>
      file === QUESTION.adapter
        ? text.replace(
            /^export class GitHubCodeHost implements CodeHost \{\n/m,
            (opening) => `${opening}  async closePullRequest(_repo: string, _number: number): Promise<void> {}\n`,
          )
        : text;

    expect(unexercisedMethods({ ...QUESTION, rewrite })).toEqual(["closePullRequest"]);
  });
});
