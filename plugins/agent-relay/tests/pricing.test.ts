import { describe, it, expect } from "vitest";
import { BudgetLimits, DEFAULT_STOP_AT } from "@amykit/core";
import { Ladders, Rung, oneLadder } from "@amykit/agent-kit";
import { SpecTable } from "@amykit/model-specs";
import { capsMoney, inertCeilingProblems, unpricedRungs } from "../src/pricing.js";

/** A table with a known hole in it: `opus` resolves, `haiku` does not. */
const TABLE: SpecTable = {
  source: "a test",
  note: "a note",
  aliases: { opus: "claude-opus-5", haiku: "claude-haiku-9" },
  models: [
    { provider: "anthropic", model: "claude-opus-5", inputPerToken: 5e-6, outputPerToken: 2.5e-5 },
  ],
};

const rung = (name: string, harness: string, model: string): Rung => ({ name, harness, model });

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
    expect(said).toContain("amy models refresh");
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
