import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testFilesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the conversation adapter offers is run by something in this
 * suite — the guardrail the tracker and the forge carry, on the port that
 * arrived after it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, "../src/SlackConversation.ts");
const QUESTION = {
  adapter: ADAPTER,
  className: "SlackConversation",
  tests: testFilesIn(here, ["every-method-is-exercised.test.ts"]),
  tsconfig: join(here, "../../../tsconfig.tests.json"),
};

const TYPED = { timeout: 60_000 };

describe("SlackConversation: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(readFileSync(ADAPTER, "utf8"), "SlackConversation");

    expect(methods).toEqual(expect.arrayContaining(["open", "post", "replies", "checks"]));
    expect(methods).not.toContain("remember");
  });

  it("finds every method called by some test", TYPED, () => {
    expect(unexercisedMethods(QUESTION)).toEqual([]);
  });
});
