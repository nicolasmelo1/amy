import { bench, describe } from "vitest";
import { Event, budgetDecision, spendSince } from "../src/index.js";

/**
 * The budget is read from the log before every move that spends an agent, so
 * its cost is paid on the hot path and it grows with the log rather than with
 * the work. That is the number this file exists to watch.
 *
 * `npm run bench` compares against the committed baseline and prints the
 * delta. It reports rather than fails: two runs on the same laptop already
 * differ by a fifth, so a threshold here would be a coin toss. A regression
 * of the order this would catch, an accidental quadratic, is not subtle.
 * `npm run bench:baseline` re-records it, deliberately.
 */
const NOW = new Date("2026-09-03T12:00:00.000Z");

function log(runs: number, spanMs: number): Event[] {
  return Array.from({ length: runs }, (_, i) => ({
    at: new Date(NOW.getTime() - Math.floor((spanMs * i) / runs)).toISOString(),
    kind: "agent.run" as const,
    detail: {
      costSource: "reported",
      costUsd: 0.01,
      tokens: { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 },
    },
  }));
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const aWeekOfWork = log(10_000, WEEK);

describe("the budget ledger", () => {
  bench("adds up a five hour window of a busy week", () => {
    spendSince(aWeekOfWork, new Date(NOW.getTime() - 5 * 60 * 60 * 1000));
  });

  bench("decides against both windows", () => {
    budgetDecision(
      aWeekOfWork,
      { stopAt: 0.9, perFiveHours: { tokens: 2_000_000, costUsd: 20 }, perWeek: { costUsd: 150 } },
      NOW,
    );
  });
});
