import { describe, it, expect } from "vitest";
import { BudgetLimits, Event, LogBudget, budgetDecision, spendSince } from "../src/index.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ago(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

/** An agent run as the worker writes one, with only what a budget reads. */
function run(at: string, detail: Record<string, unknown>): Event {
  return { at, kind: "agent.run", detail };
}

function tokens(total: number): Record<string, unknown> {
  return { input: total, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function limits(overrides: Partial<BudgetLimits> = {}): BudgetLimits {
  return { stopAt: 0.9, perFiveHours: { tokens: 1000 }, ...overrides };
}

describe("spendSince", () => {
  it("adds up every part of a run's token usage", () => {
    const events = [
      run(ago(1), { costSource: "reported", tokens: { input: 1, output: 2, cacheRead: 4, cacheWrite: 8 } }),
    ];

    expect(spendSince(events, new Date(NOW.getTime() - 5 * HOUR)).tokens).toBe(15);
  });

  it("ignores anything that is not an agent run", () => {
    const events: Event[] = [
      { at: ago(1), kind: "work.planned", detail: { tokens: tokens(500) } },
      run(ago(1), { costSource: "reported", costUsd: 2, tokens: tokens(10) }),
    ];

    expect(spendSince(events, new Date(NOW.getTime() - 5 * HOUR))).toMatchObject({
      runs: 1,
      tokens: 10,
      costUsd: 2,
    });
  });

  it("leaves a run older than the window out of both totals", () => {
    const events = [run(ago(9), { costSource: "reported", costUsd: 5, tokens: tokens(900) })];

    expect(spendSince(events, new Date(NOW.getTime() - 5 * HOUR))).toMatchObject({
      runs: 0,
      tokens: 0,
      costUsd: 0,
    });
  });

  it("counts the tokens of a run nobody costed, and none of its money", () => {
    const events = [run(ago(1), { costSource: "unknown", tokens: tokens(700) })];

    // Adding up a figure nobody measured would invent the number that decides
    // when to stop, so the dollar ceiling never moves on an unknown.
    expect(spendSince(events, new Date(NOW.getTime() - 5 * HOUR))).toMatchObject({
      tokens: 700,
      costUsd: 0,
    });
  });

  it("counts a subscription run as a real zero rather than a missing figure", () => {
    const events = [run(ago(1), { costSource: "included", costUsd: 0, tokens: tokens(700) })];

    expect(spendSince(events, new Date(NOW.getTime() - 5 * HOUR))).toMatchObject({
      tokens: 700,
      costUsd: 0,
    });
  });
});

describe("budgetDecision", () => {
  it("allows work while the window is under the fraction", () => {
    const events = [run(ago(1), { costSource: "reported", tokens: tokens(899) })];

    expect(budgetDecision(events, limits(), NOW)).toEqual({ ok: true });
  });

  it("stops at the fraction rather than at the ceiling", () => {
    const events = [run(ago(1), { costSource: "reported", tokens: tokens(900) })];

    const decision = budgetDecision(events, limits(), NOW);

    expect(decision).toMatchObject({ ok: false, window: "perFiveHours", measure: "tokens", used: 900, limit: 1000 });
  });

  it("says the window has room again when its oldest run falls out of it", () => {
    const events = [run(ago(4), { costSource: "reported", tokens: tokens(950) })];

    const decision = budgetDecision(events, limits(), NOW);

    expect(decision.ok).toBe(false);
    // The run is four hours old and the window is five, so an hour from now
    // it stops counting.
    expect(decision.ok === false && decision.retryAfterMs).toBe(HOUR);
  });

  it("refuses for the whole window when the ceiling itself is zero", () => {
    const decision = budgetDecision([], limits({ perFiveHours: { tokens: 0 } }), NOW);

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.retryAfterMs).toBe(5 * HOUR);
  });

  it("blows the dollar ceiling with the token one untouched", () => {
    const events = [run(ago(1), { costSource: "reported", costUsd: 19, tokens: tokens(10) })];

    const decision = budgetDecision(
      events,
      limits({ perFiveHours: { tokens: 1_000_000, costUsd: 20 } }),
      NOW,
    );

    expect(decision).toMatchObject({ ok: false, measure: "costUsd", used: 19, limit: 20 });
  });

  it("keeps an unknown cost off the dollar ceiling and on the token one", () => {
    const events = [run(ago(1), { costSource: "unknown", tokens: tokens(950) })];

    const money = budgetDecision(events, limits({ perFiveHours: { costUsd: 20 } }), NOW);
    const quota = budgetDecision(events, limits(), NOW);

    expect(money).toEqual({ ok: true });
    expect(quota).toMatchObject({ ok: false, measure: "tokens" });
  });

  it("catches a week that is spent even when the last five hours are quiet", () => {
    const events = [run(ago(30), { costSource: "reported", costUsd: 140, tokens: tokens(10) })];

    const decision = budgetDecision(
      events,
      { stopAt: 0.9, perFiveHours: { costUsd: 20 }, perWeek: { costUsd: 150 } },
      NOW,
    );

    expect(decision).toMatchObject({ ok: false, window: "perWeek", measure: "costUsd" });
  });

  it("allows everything when no ceiling is configured", () => {
    const events = [run(ago(1), { costSource: "reported", costUsd: 900, tokens: tokens(9_000_000) })];

    expect(budgetDecision(events, { stopAt: 0.9 }, NOW)).toEqual({ ok: true });
  });
});

describe("LogBudget", () => {
  it("answers from the log rather than from a tally of its own", () => {
    const events = [run(ago(1), { costSource: "reported", tokens: tokens(950) })];
    const log = { append: () => {}, read: () => events };

    expect(new LogBudget(log, limits()).mayStart(NOW).ok).toBe(false);
    expect(new LogBudget(log, { stopAt: 0.9 }).mayStart(NOW).ok).toBe(true);
  });
});
