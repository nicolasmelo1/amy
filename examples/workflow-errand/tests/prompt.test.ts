import { describe, expect, it } from "vitest";
import { declinedIn, errandPrompt } from "../src/prompt.js";

describe("the line a refusal ends with", () => {
  it("is asked for in the prompt, in the shape it is read back in", () => {
    const prompt = errandPrompt({ id: "T-1", repo: "acme/widgets", text: "rewrite the ledger", source: "ada", addedAt: "" });
    const line = prompt.split("\n").find((one) => one.startsWith("{"));

    expect(declinedIn(line ?? "")).toBe("why, in one sentence");
  });

  it("is read off the last line, with the reason the agent gave", () => {
    expect(declinedIn('I will not.\n{"declined": "it needs a decision nobody made"}\n')).toBe(
      "it needs a decision nobody made",
    );
  });

  it("is not found in an answer that only quotes JSON before its last line", () => {
    expect(declinedIn('The config holds {"declined": "x"} today.\nNothing needs to change.')).toBeUndefined();
  });

  it("is not found in a last line that is not a reason", () => {
    expect(declinedIn('{"declined": ""}')).toBeUndefined();
    expect(declinedIn('{"declined": true}')).toBeUndefined();
    expect(declinedIn("{not json")).toBeUndefined();
    expect(declinedIn("null")).toBeUndefined();
  });
});
