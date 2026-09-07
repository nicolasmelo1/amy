import { describe, it, expect } from "vitest";
import yaml from "yaml";
import { NO_TOKENS, TokenUsage } from "@amykit/core";
// The template the shipped `amy init` writes, read from the module that owns
// it rather than copied here: a criterion about what the template names is
// worth nothing if the copy can drift from the template.
import { EXAMPLE_CONFIG } from "../../cli/src/config.js";
import { ModelSpec, aliasFor, costOf, normalizeModelId, specFor, specTable } from "../src/specs.js";

function tokens(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return { ...NO_TOKENS, ...overrides };
}

describe("the vendored table", () => {
  it("says where its numbers came from", () => {
    // A price table with no source is a table nobody can check.
    expect(specTable().source).toContain("CodexBar");
  });

  it("says models.dev is where the base rates came from", () => {
    // The rates are `amy models refresh`'s output, committed. Naming that is
    // what makes them re-derivable rather than a snapshot somebody typed.
    expect(specTable().source).toContain("models.dev");
  });

  it("carries the models it has a verifiable price for", () => {
    const models = specTable().models.map((spec) => spec.model);

    expect(models).toContain("claude-sonnet-4-5");
    expect(models).toContain("gpt-5-codex");
  });

  it("prices the Claude 5 family, which is what a current install runs", () => {
    // It did not, and that was the failure this table exists to prevent: an
    // install with `budget.perWeek.costUsd: 150` set had no dollar ceiling at
    // all, because every run came back unpriced and `spend.costUsd` never
    // moved. The token ceiling beside it still fired, which is what made it
    // quiet.
    expect(specFor("claude-opus-5")?.inputPerToken).toBe(5e-6);
    expect(specFor("claude-sonnet-5")?.outputPerToken).toBe(1e-5);
    expect(specFor("claude-opus-4-8")?.cacheWritePerToken).toBe(6.25e-6);
    expect(specFor("claude-sonnet-4-6")?.inputPerToken).toBe(3e-6);
    // 0.025x input, not the 0.1x every other model reads a cache hit at.
    expect(specFor("claude-fable-5-1")?.cacheReadPerToken).toBe(2.5e-7);
  });

  it("gives the 1M-context models no long-context tier, because they have none", () => {
    // "Claude 4.6 and later models include the full 1M token context window
    // at standard pricing." Inventing a threshold here would overcount, and
    // omitting a real one would undercount, which is the worse direction.
    for (const model of ["claude-opus-5", "claude-sonnet-5", "claude-fable-5-1"]) {
      expect(specFor(model)?.thresholdTokens, model).toBeUndefined();
    }
  });

  it("leaves out a model nobody could price, rather than guessing", () => {
    // Absent is a real answer: it produces costSource `unknown`, and the
    // token ceiling still stops the work. What is no longer allowed is a
    // dollar ceiling over a ladder naming one — that is refused at boot.
    expect(specFor("claude-opus-6")).toBeUndefined();
  });
});

/**
 * The models `amy init` writes into a ladder, taken from the template.
 *
 * Short names, because that is what the harness CLI takes and therefore what
 * the config passes through: `claude:sonnet`, not `claude:claude-sonnet-5`.
 */
function modelsTheTemplateNames(): string[] {
  const config = yaml.parse(EXAMPLE_CONFIG) as {
    agent?: { ladder?: string[]; ladderByStep?: Record<string, string[]>; model?: string };
  };

  const entries = [
    ...(config.agent?.ladder ?? []),
    ...Object.values(config.agent?.ladderByStep ?? {}).flat(),
  ];
  const fromLadders = entries.flatMap((entry) => entry.split(":").slice(1));

  return [...new Set([...fromLadders, config.agent?.model ?? ""])].filter(Boolean);
}

describe("the models the shipped template names", () => {
  it("is a list, so nothing below passes by finding nothing", () => {
    expect(modelsTheTemplateNames().length).toBeGreaterThan(0);
  });

  it("is priced, every one of them", () => {
    // The same template sets `budget.perWeek.costUsd`, and a costUsd ceiling
    // over a rung this table cannot price is refused at boot. So a name here
    // the table has fallen behind on is the shipped default failing to start.
    for (const model of modelsTheTemplateNames()) {
      expect(specFor(aliasFor(model)), model).toBeDefined();
    }
  });
});

describe("aliasFor", () => {
  it("resolves the short name a harness CLI takes", () => {
    // `claude --model haiku` is documented as an alias for the latest model
    // of that family, and a real run reports `claude-haiku-4-5-20251001`.
    expect(aliasFor("haiku")).toBe("claude-haiku-4-5");
  });

  it("leaves a full id exactly as it is", () => {
    expect(aliasFor("claude-opus-5")).toBe("claude-opus-5");
  });

  it("leaves a name it has never heard of alone, rather than guessing", () => {
    expect(aliasFor("gpt-5-mini")).toBe("gpt-5-mini");
  });

  it("resolves every alias the table declares to a model the table prices", () => {
    // An alias pointing at a row that is not there would make a ladder look
    // priceable and leave the ceiling inert anyway, which is the exact
    // failure with one more indirection in front of it.
    for (const alias of Object.keys(specTable().aliases ?? {})) {
      expect(specFor(aliasFor(alias)), alias).toBeDefined();
    }
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

  it("reads a version written the way people say it", () => {
    // Ids use dashes and every sentence about them uses dots, and a ladder is
    // written by hand.
    expect(normalizeModelId("claude-opus-4.5")[0]).toBe("claude-opus-4-5");
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

/**
 * Two real `claude -p --output-format json` runs, 2026-09-07.
 *
 * The envelope carries `total_cost_usd`, which the harness worked out itself
 * from the plan it is on — so these are not a fixture of our own arithmetic.
 * They are the number that was billed, and this table has to reproduce it to
 * the last digit or the two ceilings in one config disagree about the same
 * run: `costSource: "reported"` for a claude run, `"computed"` for the same
 * model reached through a harness that says nothing about money.
 *
 * Both runs put every cache write in the one-hour bucket, which is where the
 * money was: at 2x input it is 90% of the haiku bill. A table that billed
 * those at the 1.25x write rate would be 40% light and look plausible.
 */
describe("costOf against what the harness itself billed", () => {
  it("reproduces a haiku run to the last digit", () => {
    const haiku = specFor("claude-haiku-4-5-20251001")!;

    expect(
      costOf(haiku, { input: 10, output: 48, cacheRead: 14_058, cacheWrite: 7907, cacheWrite1h: 7907 }),
    ).toBeCloseTo(0.0174698, 10);
  });

  it("reproduces a sonnet run to the last digit", () => {
    // A different rate tier, so the two together catch a table that happens
    // to be right about one model.
    const sonnet = specFor("claude-sonnet-5")!;

    expect(
      costOf(sonnet, { input: 2, output: 645, cacheRead: 19_123, cacheWrite: 11_239, cacheWrite1h: 11_239 }),
    ).toBeCloseTo(0.0552346, 10);
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
