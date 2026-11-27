import { describe, expect, it } from "vitest";
import { classify } from "../src/CodexHarness.js";

describe("a codex turn that completed", () => {
  it("is completed when it ended without a final message, as a claude or hermes run that said nothing is", () => {
    // An implementing turn that looked, changed nothing and said nothing still
    // completed: reading it as failed would hand it to a stronger rung, and a
    // run that changed nothing never climbs unless its step's verify refuses it.
    expect(classify({ status: "completed", items: [{ type: "reasoning", text: "looked around" }] })).toBe("completed");
    expect(classify({ status: "completed", items: [] })).toBe("completed");
  });
});
