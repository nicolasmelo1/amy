import { describe, expect, it } from "vitest";
import { briefOf, renderBrief } from "../src/index.js";
import type { BriefRecord, BriefStore } from "../src/index.js";

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

function brief(id: string, body: string): BriefRecord {
  return {
    id,
    sections: [{ name: "Goal", body }],
    explains: [id],
    questions: [],
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    revision: 1,
  };
}

/** A store holding exactly the briefs named, and refusing every write. */
function storeOf(held: Record<string, BriefRecord>): BriefStore {
  return {
    get: async (id) => held[id] ?? null,
    write: async () => {
      throw new Error("this test writes no brief");
    },
    appendQuestion: async () => {
      throw new Error("this test appends no question");
    },
    retired: async () => [],
    remove: async () => {},
  };
}

describe("the brief a unit is worked against", () => {
  it("answers the brief stored under the unit's own id, whatever briefId names", async () => {
    const store = storeOf({
      "PROJ-1239": brief("PROJ-1239", "One currency on every invoice line."),
      "invoice-currency": brief("invoice-currency", "The feature-level statement."),
    });

    const found = await briefOf(store, { workId: "PROJ-1239", briefId: "invoice-currency" });

    expect(found?.id).toBe("PROJ-1239");
    expect(renderBrief(found!).text).toContain("One currency on every invoice line.");
  });

  it("answers the brief briefId names when the unit has none of its own", async () => {
    const store = storeOf({ "invoice-currency": brief("invoice-currency", "The feature-level statement.") });

    const found = await briefOf(store, { workId: "PROJ-1239", briefId: "invoice-currency" });

    expect(found?.id).toBe("invoice-currency");
  });

  it("answers null when neither id names a brief, and when nothing is mounted", async () => {
    expect(await briefOf(storeOf({}), { workId: "PROJ-1239", briefId: "invoice-currency" })).toBeNull();
    expect(await briefOf(storeOf({}), { workId: "PROJ-1239" })).toBeNull();
    expect(await briefOf(undefined, { workId: "PROJ-1239", briefId: "invoice-currency" })).toBeNull();
  });

  it("throws what the store threw when the unit's own read fails, rather than reading it as none", async () => {
    const failing: BriefStore = {
      ...storeOf({}),
      get: async (id) => {
        throw new Error(`the brief \`${id}\` could not be read`);
      },
    };

    await expect(briefOf(failing, { workId: "PROJ-1239", briefId: "invoice-currency" }))
      .rejects.toThrow("the brief `PROJ-1239` could not be read");
  });
});
