import { describe, it, expect } from "vitest";
import { extractJson } from "../src/json.js";

describe("extractJson", () => {
  it("reads a bare object", () => {
    expect(extractJson('{"clear":true}')).toEqual({ clear: true });
  });

  it("reads an object out of a fenced block", () => {
    const reply = 'Here is my answer:\n\n```json\n{"clear": false, "questions": ["why?"]}\n```\n';

    expect(extractJson(reply)).toEqual({ clear: false, questions: ["why?"] });
  });

  it("reads an object followed by chatter", () => {
    expect(extractJson('{"a":1}\n\nLet me know if you need more.')).toEqual({ a: 1 });
  });

  it("handles nesting", () => {
    const reply = '{"verdicts":[{"threadId":"T1","verdict":"fixed","note":"done"}]}';

    expect(extractJson(reply)).toEqual({
      verdicts: [{ threadId: "T1", verdict: "fixed", note: "done" }],
    });
  });

  it("is not fooled by a brace inside a string", () => {
    expect(extractJson('{"note":"use {} for an empty object"}')).toEqual({
      note: "use {} for an empty object",
    });
  });

  it("is not fooled by an escaped quote", () => {
    expect(extractJson('{"note":"he said \\"no\\" twice"}')).toEqual({
      note: 'he said "no" twice',
    });
  });

  it("says so when there is no object at all", () => {
    expect(() => extractJson("I could not decide.")).toThrow(/no JSON object in the reply/);
  });

  it("says so when the object never closes", () => {
    expect(() => extractJson('{"clear": true')).toThrow(/not closed/);
  });
});
