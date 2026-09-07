import { describe, it, expect } from "vitest";
import { BudgetLimits, DEFAULT_STOP_AT } from "@amykit/core";
import { Ladders, Rung, oneLadder } from "@amykit/agent-kit";
import { SpecTable } from "@amykit/model-specs";
import { capsMoney, inertCeilingProblems, unpricedRungs } from "../src/pricing.js";

/**
 * A table with a known hole in it: `opus` resolves, `haiku` does not.
 *
 * It carries one priced model per provider on purpose. A machine with no
 * Claude Code on it reaches this check through a `codex:` rung, and a table
 * that could only ever price `anthropic` would make the codex cases here
 * pass for the wrong reason.
 */
const TABLE: SpecTable = {
  source: "a test",
  note: "a note",
  aliases: { opus: "claude-opus-5", haiku: "claude-haiku-9" },
  models: [
    { provider: "anthropic", model: "claude-opus-5", inputPerToken: 5e-6, outputPerToken: 2.5e-5 },
    { provider: "openai", model: "gpt-5-codex", inputPerToken: 1.75e-6, outputPerToken: 1.4e-5 },
  ],
};

const rung = (name: string, harness: string, model: string): Rung => ({ name, harness, model });

/** A rung whose harness accounts for itself: claude, or hermes. */
const reporting = (name: string, harness: string, model: string): Rung => ({
  name,
  harness,
  model,
  pricesItsOwnRuns: true,
});

const limits = (over: Partial<BudgetLimits> = {}): BudgetLimits => ({
  stopAt: DEFAULT_STOP_AT,
  ...over,
});

describe("capsMoney", () => {
  it("is true of a window with a dollar ceiling", () => {
    expect(capsMoney(limits({ perWeek: { costUsd: 150 } }))).toBe(true);
  });

  it("is false of a ceiling written only in tokens", () => {
    expect(capsMoney(limits({ perFiveHours: { tokens: 2_000_000 } }))).toBe(false);
  });

  it("is false of no ceiling at all", () => {
    expect(capsMoney(limits())).toBe(false);
  });

  it("is true when any one window names money, not only the first", () => {
    expect(capsMoney(limits({ perFiveHours: { tokens: 10 }, perWeek: { costUsd: 20 } }))).toBe(true);
  });
});

describe("unpricedRungs", () => {
  it("finds nothing when the table prices every rung", () => {
    const ladders = oneLadder([rung("claude:opus", "claude", "opus")]);

    expect(unpricedRungs(ladders, TABLE)).toEqual([]);
  });

  it("names the rung and the model it names", () => {
    const ladders = oneLadder([rung("claude:haiku", "claude", "haiku")]);

    expect(unpricedRungs(ladders, TABLE)).toEqual([{ rung: "claude:haiku", model: "haiku" }]);
  });

  it("reads a rung under a step's own ladder, not only the default", () => {
    // The step ladder is where the model that does the expensive half of the
    // work is named, so a check that read only the fallback would miss the
    // one whose cost going missing matters most.
    const ladders: Ladders<Rung> = {
      fallback: [rung("claude:opus", "claude", "opus")],
      byStep: { implement: [rung("claude:haiku", "claude", "haiku")] },
    };

    expect(unpricedRungs(ladders, TABLE).map((found) => found.rung)).toEqual(["claude:haiku"]);
  });

  it("names a rung once, however many ladders reach it", () => {
    const ladders: Ladders<Rung> = {
      fallback: [rung("claude:haiku", "claude", "haiku")],
      byStep: { triage: [rung("claude:haiku", "claude", "haiku")] },
    };

    expect(unpricedRungs(ladders, TABLE)).toHaveLength(1);
  });

  it("counts a rung that named no model at all", () => {
    // The single-model install: `ladder: [claude]` runs whatever the CLI
    // defaults to, and there is no id here to price it by.
    const ladders = oneLadder([rung("claude", "claude", "")]);

    expect(unpricedRungs(ladders, TABLE)).toEqual([{ rung: "claude", model: "" }]);
  });
});

describe("inertCeilingProblems", () => {
  const unpriced = oneLadder([rung("claude:haiku", "claude", "haiku")]);
  const priced = oneLadder([rung("claude:opus", "claude", "opus")]);

  it("refuses a dollar ceiling it cannot price", () => {
    expect(inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), unpriced, TABLE)).toHaveLength(1);
  });

  it("names the model and the rung, so the answer is obvious from the refusal", () => {
    const [said] = inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), unpriced, TABLE);

    expect(said).toContain("`haiku`");
    expect(said).toContain("`claude:haiku`");
    // Not `amy models refresh` on its own: it re-rates the rows the table
    // has and never adds one, so it cannot fix a model that is missing.
    expect(said).toContain(".amy/model-specs.json");
    expect(said).toContain("never adds");
  });

  it("lets a ceiling in tokens alone through, against the same ladder", () => {
    // Tokens are what a subscription meters and every harness reports them,
    // so this ceiling needs no price table and refusing it would be theatre.
    expect(inertCeilingProblems(limits({ perWeek: { tokens: 30_000_000 } }), unpriced, TABLE)).toEqual([]);
  });

  it("lets no ceiling at all through", () => {
    expect(inertCeilingProblems(limits(), unpriced, TABLE)).toEqual([]);
  });

  it("lets a dollar ceiling through when every rung is priced", () => {
    expect(inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), priced, TABLE)).toEqual([]);
  });

  it("says so for each unpriced rung, rather than only the first", () => {
    const two = oneLadder([
      rung("claude:haiku", "claude", "haiku"),
      rung("codex:gpt-9", "codex", "gpt-9"),
    ]);

    expect(inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), two, TABLE)).toHaveLength(2);
  });

  it("explains a rung with no model rather than quoting an empty name", () => {
    const bare = oneLadder([rung("claude", "claude", "")]);
    const [said] = inertCeilingProblems(limits({ perFiveHours: { costUsd: 20 } }), bare, TABLE);

    expect(said).toContain("harness default model");
    expect(said).toContain("`claude`");
  });
});

/**
 * The machine with no Claude Code on it.
 *
 * Every case above reaches the check through a `claude:` rung, which makes
 * the whole check look like it is about one harness. It is not: an install
 * whose only harness is codex writes `codex:<model>` rungs, and it meets this
 * refusal first and hardest, because the shipped table prices Claude models
 * and a gpt id has to be put there before a dollar ceiling means anything.
 */
describe("a codex install, on a machine with no claude", () => {
  const priced = oneLadder([rung("codex:gpt-5-codex", "codex", "gpt-5-codex")]);
  const unpriced = oneLadder([rung("codex:gpt-9-codex", "codex", "gpt-9-codex")]);

  it("prices a codex rung the table has a row for", () => {
    expect(unpricedRungs(priced, TABLE)).toEqual([]);
  });

  it("lets a dollar ceiling through when the codex model is priced", () => {
    expect(inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), priced, TABLE)).toEqual([]);
  });

  it("refuses a dollar ceiling over a codex model with no row", () => {
    const [said] = inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), unpriced, TABLE);

    expect(said).toContain("`gpt-9-codex`");
    expect(said).toContain("`codex:gpt-9-codex`");
  });

  it("boots the same codex ladder under a ceiling in tokens", () => {
    // The escape hatch that has to work on this machine: no row to add and
    // no claude to fall back to, so tokens are the ceiling it can have.
    expect(inertCeilingProblems(limits({ perWeek: { tokens: 30_000_000 } }), unpriced, TABLE)).toEqual([]);
  });

  it("refuses `ladder: [codex]`, which names no model to price", () => {
    // `models: []` in the codex plugin contributes a single agent named
    // `codex` and leaves the choice to the CLI, so there is no id here
    // either — the same shape as `ladder: [claude]`, one harness over.
    const bare = oneLadder([rung("codex", "codex", "")]);
    const [said] = inertCeilingProblems(limits({ perWeek: { costUsd: 150 } }), bare, TABLE);

    expect(said).toContain("harness default model");
    expect(said).toContain("`codex`");
  });

  it("names an unpriced codex rung beside an unpriced claude one", () => {
    // A machine that has both writes both, and a refusal that stopped at the
    // first would send somebody to fix one rung and boot into the next.
    const mixed = oneLadder([
      rung("codex:gpt-9-codex", "codex", "gpt-9-codex"),
      rung("claude:haiku", "claude", "haiku"),
    ]);

    expect(unpricedRungs(mixed, TABLE).map((found) => found.rung)).toEqual([
      "codex:gpt-9-codex",
      "claude:haiku",
    ]);
  });
});

/**
 * The harnesses that account for themselves.
 *
 * The check underneath all of this is not "is this model in the price
 * table", it is "could a run of this rung arrive with a cost on it". Those
 * two questions have the same answer for codex alone, and reading the first
 * as the second refuses installs whose ceilings work perfectly well.
 */
describe("a harness that prices its own runs", () => {
  const ceiling = limits({ perWeek: { costUsd: 150 } });

  it("is not unpriced merely because the table has no row", () => {
    const ladders = oneLadder([reporting("claude:opus-9", "claude", "opus-9")]);

    expect(unpricedRungs(ladders, TABLE)).toEqual([]);
  });

  it("boots under a dollar ceiling on a model no table will ever carry", () => {
    // A hermes run on a local model comes back `cost_status: "included"` at
    // zero. Zero is the right answer, not a missing one, and no price list
    // publishes a rate for a model running on somebody's own machine — so
    // refusing this ceiling would refuse an install whose spend is known.
    const ollama = oneLadder([reporting("hermes:llama-3.3", "hermes", "llama-3.3")]);

    expect(inertCeilingProblems(ceiling, ollama, TABLE)).toEqual([]);
  });

  it("boots on a provider the table never heard of", () => {
    // Hermes prices the long tail itself and writes `estimated_cost_usd`.
    const portal = oneLadder([reporting("hermes:hermes-4-405b", "hermes", "hermes-4-405b")]);

    expect(inertCeilingProblems(ceiling, portal, TABLE)).toEqual([]);
  });

  it("boots with no model named at all, because the cost still arrives", () => {
    // `ladder: [claude]` under a dollar ceiling: there is no id to price it
    // by, and it does not matter, because the envelope carries the cost.
    const bare = oneLadder([reporting("claude", "claude", "")]);

    expect(inertCeilingProblems(ceiling, bare, TABLE)).toEqual([]);
  });

  it("still refuses the codex rung standing beside it", () => {
    // The mixed machine: the refusal has to be about the one rung that
    // cannot be priced, and say nothing about the two that can.
    const mixed = oneLadder([
      reporting("claude:opus-9", "claude", "opus-9"),
      reporting("hermes:llama-3.3", "hermes", "llama-3.3"),
      rung("codex:gpt-9-codex", "codex", "gpt-9-codex"),
    ]);
    const problems = inertCeilingProblems(ceiling, mixed, TABLE);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`codex:gpt-9-codex`");
  });
});
