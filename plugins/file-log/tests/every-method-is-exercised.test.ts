import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { publicMethodsOf, testFilesIn, unexercisedMethods } from "@amykit/test-fixtures";

/**
 * Every method the event log offers is run by something in this suite — the
 * guardrail `watch` arrived through, so the next method cannot arrive without
 * a test either.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, "../src/FileEventLog.ts");
const QUESTION = {
  adapter: ADAPTER,
  className: "FileEventLog",
  tests: testFilesIn(here, ["every-method-is-exercised.test.ts"]),
  tsconfig: join(here, "../../../tsconfig.tests.json"),
};

const TYPED = { timeout: 60_000 };

describe("FileEventLog: no method ships unproven", () => {
  it("reads the methods from the adapter's own source", () => {
    const methods = publicMethodsOf(readFileSync(ADAPTER, "utf8"), "FileEventLog");

    expect(methods).toEqual(expect.arrayContaining(["append", "read", "watch"]));
    expect(methods).not.toContain("tail");
  });

  it("finds every method called by some test", TYPED, () => {
    expect(unexercisedMethods(QUESTION)).toEqual([]);
  });
});
