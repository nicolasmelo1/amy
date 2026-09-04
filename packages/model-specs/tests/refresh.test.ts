import { describe, it, expect } from "vitest";
import { ModelsDevCatalog, refreshFrom } from "../src/refresh.js";
import { SpecTable } from "../src/specs.js";

const TABLE: SpecTable = {
  source: "vendored",
  note: "a note",
  models: [
    {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      inputPerToken: 3e-6,
      outputPerToken: 1.5e-5,
      cacheReadPerToken: 3e-7,
      cacheWritePerToken: 3.75e-6,
      thresholdTokens: 200_000,
      aboveThreshold: {
        inputPerToken: 6e-6,
        outputPerToken: 2.25e-5,
        cacheReadPerToken: 6e-7,
        cacheWritePerToken: 7.5e-6,
      },
    },
    { provider: "openai", model: "gpt-5-codex", inputPerToken: 1.25e-6, outputPerToken: 1e-5 },
  ],
};

/** models.dev quotes dollars per million tokens. */
const CATALOG: ModelsDevCatalog = {
  anthropic: {
    id: "anthropic",
    models: {
      "claude-sonnet-4-5-20250929": {
        cost: { input: 4, output: 15, cache_read: 0.3, cache_write: 3.75 },
        limit: { context: 1_000_000 },
      },
    },
  },
  openai: { id: "openai", models: {} },
};

describe("refreshFrom", () => {
  it("takes the base rate from models.dev, converting per million to per token", () => {
    const { table } = refreshFrom(CATALOG, TABLE);

    expect(table.models[0]?.inputPerToken).toBeCloseTo(4e-6, 12);
  });

  it("keeps the long-context tiering, which models.dev does not publish", () => {
    // This is the whole reason a refresh is not a replacement. Dropping the
    // threshold would make a 200k request look cheaper than it is, which is
    // the one direction a cost estimate must never be wrong in.
    const { table } = refreshFrom(CATALOG, TABLE);

    expect(table.models[0]?.thresholdTokens).toBe(200_000);
    expect(table.models[0]?.aboveThreshold?.inputPerToken).toBe(6e-6);
  });

  it("finds a family id under the dated id models.dev files it as", () => {
    const { unmatched } = refreshFrom(CATALOG, TABLE);

    expect(unmatched).not.toContain("claude-sonnet-4-5");
  });

  it("takes the context window when models.dev has one", () => {
    const { table } = refreshFrom(CATALOG, TABLE);

    expect(table.models[0]?.contextWindow).toBe(1_000_000);
  });

  it("says what changed, in the rates that changed", () => {
    const { changed } = refreshFrom(CATALOG, TABLE);

    expect(changed).toEqual([
      { model: "claude-sonnet-4-5", field: "inputPerToken", was: 3e-6, now: 4e-6 },
    ]);
  });

  it("does not report the arithmetic as a change", () => {
    // Dividing by a million and back does not round-trip exactly, and a diff
    // that displays identically teaches the reader to skim the list.
    const same: ModelsDevCatalog = {
      anthropic: {
        models: {
          "claude-sonnet-4-5-20250929": {
            cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
          },
        },
      },
    };

    expect(refreshFrom(same, TABLE).changed).toEqual([]);
  });

  it("leaves a model models.dev does not know exactly as it was, and says so", () => {
    const { table, unmatched } = refreshFrom(CATALOG, TABLE);

    expect(unmatched).toEqual(["gpt-5-codex"]);
    expect(table.models[1]).toEqual(TABLE.models[1]);
  });

  it("never adds a model nobody asked for", () => {
    // models.dev lists 213 providers. A refresh updates what is in the table;
    // it does not turn it into a catalogue.
    const { table } = refreshFrom(
      { anthropic: { models: { "claude-brand-new": { cost: { input: 1, output: 2 } } } } },
      TABLE,
    );

    expect(table.models).toHaveLength(2);
  });

  it("records where the numbers came from, and what was kept", () => {
    const { table } = refreshFrom(CATALOG, TABLE);

    expect(table.source).toContain("models.dev");
    expect(table.source).toContain("tiering kept");
  });

  it("does not mind a catalogue with nothing in it", () => {
    const { table, changed, unmatched } = refreshFrom({}, TABLE);

    expect(changed).toEqual([]);
    expect(unmatched).toHaveLength(2);
    expect(table.models).toEqual(TABLE.models);
  });
});
