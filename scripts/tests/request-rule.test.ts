import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Rule {
  defaults: { forbidden: { regex: string }[] };
}

const rule = parse(fs.readFileSync(path.join(process.cwd(), ".software-factory/rules/a-request-has-a-deadline.yaml"), "utf-8")) as Rule;
// eslint-disable-next-line security/detect-non-literal-regexp -- the patterns are the rule's own, read from its catalog file
const patterns = rule.defaults.forbidden.map((one) => new RegExp(one.regex));
const flagged = (line: string) => patterns.some((pattern) => pattern.test(line));

describe("the rule that every request has a deadline", () => {
  it.each([
    "const response = await fetch(url);",
    "const response = await globalThis.fetch(url, { method: \"POST\" });",
    "const response = await global.fetch(url);",
    "const response = await self.fetch(url);",
  ])("flags a request made outside the one transport: %s", (line) => {
    expect(flagged(line)).toBe(true);
  });

  it("leaves a call to the transport alone", () => {
    expect(flagged("const response = await fetchTransport({ url, method: \"GET\", headers: {} });")).toBe(false);
  });
});
