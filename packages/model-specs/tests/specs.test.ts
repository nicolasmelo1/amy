import { describe, it, expect } from "vitest";
import { NO_TOKENS, TokenUsage } from "@amy/core";
import { ModelSpec, costOf, normalizeModelId, specFor, specTable } from "../src/specs.js";

function tokens(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return { ...NO_TOKENS, ...overrides };
}

describe("the vendored table", () => {
  it("says where its numbers came from", () => {
    // A price table with no source is a table nobody can check.
    expect(specTable().source).toContain("CodexBar");
  });

  it("carries the models it has a verifiable price for", () => {
    const models = specTable().models.map((spec) => spec.model);

    expect(models).toContain("claude-sonnet-4-5");
    expect(models).toContain("gpt-5-codex");
  });

  it("leaves out a model nobody could price, rather than guessing", () => {
    // Absent is a real answer: it produces costSource `unknown`, and the
    // token ceiling still stops the work.
    expect(specFor("claude-opus-5")).toBeUndefined();
  });
});

describe("normalizeModelId", () => {
  it("drops the context window a harness appends", () => {
    expect(normalizeModelId("claude-opus-5[1m]")[0]).toBe("claude-opus-5");
  });

  it("drops a provider prefix", () => {
    expect(normalizeModelId("anthropic/claude-sonnet-4-5")[0]).toBe("claude-sonnet-4-5");
  });

  it("falls back from a dated release to its family", () => {
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toEqual([
      "claude-haiku-4-5-20251001",
      "claude-haiku-4-5",
    ]);
  });

  it("does not invent a fallback where there is no date", () => {
    expect(normalizeModelId("gpt-5-mini")).toEqual(["gpt-5-mini"]);
  });

  it("does not care about case or stray spaces", () => {
    expect(normalizeModelId("  Claude-Sonnet-4-5  ")[0]).toBe("claude-sonnet-4-5");
  });
});

describe("specFor", () => {
  it("finds a model by its exact id", () => {
    expect(specFor("claude-sonnet-4-5")?.provider).toBe("anthropic");
  });

  it("finds a dated release through its family", () => {
    expect(specFor("claude-haiku-4-5-20251001")?.model).toBe("claude-haiku-4-5");
  });

  it("finds a model a harness decorated with its window", () => {
    // This is the one that costs every line its cost when it is missing.
    expect(specFor("claude-opus-4-6[1m]")?.model).toBe("claude-opus-4-6");
  });
});

describe("costOf", () => {
  const sonnet = specFor("claude-sonnet-4-5")!;
  const opus = specFor("claude-opus-4-5")!;

  it("costs nothing for nothing", () => {
    expect(costOf(sonnet, NO_TOKENS)).toBe(0);
  });

  it("charges each kind of token at its own rate", () => {
    // 1000*3e-6 + 500*1.5e-5 + 2000*3e-7 + 1000*3.75e-6
    const cost = costOf(
      sonnet,
      tokens({ input: 1000, output: 500, cacheRead: 2000, cacheWrite: 1000 }),
    );

    expect(cost).toBeCloseTo(0.01485, 10);
  });

  it("measures the threshold on the whole input side, not on input alone", () => {
    // 150k input alone is under, but with 60k of cache reads the request is
    // over, and undercounting here is the easy mistake.
    const under = costOf(sonnet, tokens({ input: 150_000 }));
    const over = costOf(sonnet, tokens({ input: 150_000, cacheRead: 60_000 }));

    expect(under).toBeCloseTo(150_000 * 3e-6, 10);
    expect(over).toBeCloseTo(150_000 * 6e-6 + 60_000 * 6e-7, 10);
  });

  it("re-rates the whole request above the threshold, not just the excess", () => {
    // 200_001 input: every token at the long-context rate, not one of them.
    const cost = costOf(sonnet, tokens({ input: 200_001, output: 100 }));

    expect(cost).toBeCloseTo(200_001 * 6e-6 + 100 * 2.25e-5, 8);
  });

  it("stays on the base rate exactly at the threshold", () => {
    expect(costOf(sonnet, tokens({ input: 200_000 }))).toBeCloseTo(200_000 * 3e-6, 8);
  });

  it("bills a one-hour cache write at twice the input rate", () => {
    // Not something any of the four rate fields expresses.
    const oneHour = costOf(opus, tokens({ cacheWrite: 1000, cacheWrite1h: 1000 }));
    const fiveMinute = costOf(opus, tokens({ cacheWrite: 1000 }));

    expect(oneHour).toBeCloseTo(1000 * 5e-6 * 2, 10);
    expect(fiveMinute).toBeCloseTo(1000 * 6.25e-6, 10);
  });

  it("splits a mixed cache write between the two rates", () => {
    const cost = costOf(opus, tokens({ cacheWrite: 1000, cacheWrite1h: 400 }));

    expect(cost).toBeCloseTo(600 * 6.25e-6 + 400 * 5e-6 * 2, 10);
  });

  it("ignores a one-hour figure larger than the write it belongs to", () => {
    const cost = costOf(opus, tokens({ cacheWrite: 100, cacheWrite1h: 999 }));

    expect(cost).toBeCloseTo(100 * 5e-6 * 2, 10);
  });

  it("treats a negative count as nothing, rather than as a refund", () => {
    expect(costOf(opus, tokens({ input: -5000, output: 10 }))).toBeCloseTo(10 * 2.5e-5, 10);
  });

  it("falls back to the input rate for a kind the model does not price", () => {
    const spec: ModelSpec = {
      provider: "test",
      model: "priced-simply",
      inputPerToken: 1e-6,
      outputPerToken: 2e-6,
    };

    expect(costOf(spec, tokens({ cacheRead: 100, cacheWrite: 100 }))).toBeCloseTo(200 * 1e-6, 10);
  });

  it("keeps a base rate the above-threshold table does not override", () => {
    const spec: ModelSpec = {
      provider: "test",
      model: "partly-tiered",
      inputPerToken: 1e-6,
      outputPerToken: 2e-6,
      cacheReadPerToken: 1e-7,
      thresholdTokens: 10,
      aboveThreshold: { inputPerToken: 2e-6, outputPerToken: 4e-6 },
    };

    // cacheRead is not re-rated because the tier does not mention it.
    expect(costOf(spec, tokens({ input: 20, cacheRead: 10 }))).toBeCloseTo(
      20 * 2e-6 + 10 * 1e-7,
      10,
    );
  });
});
