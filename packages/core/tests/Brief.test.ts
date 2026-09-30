import { describe, expect, it } from "vitest";
import { renderBrief } from "../src/index.js";

describe("a brief is opaque to the core", () => {
  it("renders sections no workflow schema could understand without interpreting them", () => {
    const view = renderBrief({
      id: "opaque",
      sections: [{ name: "__unknown__", body: "[not a workflow schema]" }],
      explains: [],
      questions: [],
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
      revision: 1,
    });

    expect(view).toEqual({ text: "__unknown__\n[not a workflow schema]", revision: 1 });
  });
});