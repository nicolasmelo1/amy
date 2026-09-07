import { describe, it, expect } from "vitest";
import { BudgetLimits, DEFAULT_STOP_AT, Event } from "@amykit/core";
import { budgetLines } from "../src/budget.js";

const NOW = new Date("2026-09-07T12:00:00.000Z");

const limits = (over: Partial<BudgetLimits> = {}): BudgetLimits => ({
  stopAt: DEFAULT_STOP_AT,
  ...over,
});

/** An agent run as the worker writes one, with only what a budget reads. */
function run(costSource: string, costUsd?: number, minutesAgo = 10): Event {
  return {
    at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    kind: "agent.run",
    detail: {
      costSource,
      ...(costUsd === undefined ? {} : { costUsd }),
      tokens: { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 },
    },
  } as Event;
}

const perFiveHours = (lines: string[]): string[] =>
  lines.filter((line) => line.includes("perFiveHours") || line.includes("note:"));

describe("budgetLines", () => {
  it("reports a window with nothing in it", () => {
    const lines = budgetLines([], limits({ perFiveHours: { costUsd: 20 } }), NOW);

    expect(lines.join("\n")).toContain("0 run(s)");
    expect(lines.join("\n")).toContain("new work: allowed");
  });

  it("counts the money of the runs that carried a price", () => {
    const lines = budgetLines(
      [run("reported", 1.5), run("computed", 0.25)],
      limits({ perFiveHours: { costUsd: 20 } }),
      NOW,
    );

    expect(perFiveHours(lines)[0]).toContain("$1.75 of $20.00 USD (9%)");
  });

  it("says how many runs in the window carry no price", () => {
    // The dollar figure beside it is arithmetically true and practically a
    // lie: it is the spend of the priced runs, not the spend of the window.
    const lines = budgetLines(
      [run("reported", 1.5), run("unknown"), run("unknown")],
      limits({ perFiveHours: { costUsd: 20 } }),
      NOW,
    );

    expect(perFiveHours(lines).join("\n")).toContain("2 of those 3 run(s) carry no price");
  });

  it("points at the command that fixes it", () => {
    const lines = budgetLines([run("unknown")], limits({ perWeek: { costUsd: 150 } }), NOW);

    expect(lines.join("\n")).toContain("amy models refresh");
  });

  it("says nothing about prices when the window is metered in tokens", () => {
    // Nothing was left out: a window metered in tokens counted every run it
    // saw, so the caveat would be noise on a figure that is not missing any.
    const lines = budgetLines([run("unknown")], limits({ perFiveHours: { tokens: 10_000 } }), NOW);

    expect(lines.join("\n")).not.toContain("carry no price");
  });

  it("does not call a subscription run unpriced, because zero is its real cost", () => {
    // `included` is a measurement: the plan already paid for it. Counting it
    // as unknown would send somebody to refresh a price table over a run
    // whose price was never in doubt.
    const lines = budgetLines([run("included", 0)], limits({ perWeek: { costUsd: 150 } }), NOW);

    expect(lines.join("\n")).not.toContain("carry no price");
  });

  it("treats a run that claimed a price and carried none as unpriced", () => {
    const lines = budgetLines([run("reported")], limits({ perWeek: { costUsd: 150 } }), NOW);

    expect(lines.join("\n")).toContain("1 of those 1 run(s) carry no price");
  });

  it("says why new work is parked, and when there will be room", () => {
    const lines = budgetLines([run("reported", 19)], limits({ perFiveHours: { costUsd: 20 } }), NOW);

    expect(lines.join("\n")).toContain("new work: parked");
    expect(lines.join("\n")).toContain("costUsd ceiling");
    expect(lines.join("\n")).toContain("room again in");
  });

  it("reports every window, whether or not it has a ceiling", () => {
    const lines = budgetLines([run("reported", 1)], limits({ perFiveHours: { costUsd: 20 } }), NOW);

    expect(lines.join("\n")).toContain("perFiveHours");
    expect(lines.join("\n")).toContain("perWeek");
    expect(lines.join("\n")).toContain("no ceiling");
  });

  it("leaves a run older than the window out of it", () => {
    const lines = budgetLines(
      [run("reported", 5, 6 * 60)],
      limits({ perFiveHours: { costUsd: 20 }, perWeek: { costUsd: 150 } }),
      NOW,
    );

    expect(perFiveHours(lines)[0]).toContain("$0.00 of $20.00");
    expect(lines.join("\n")).toContain("$5.00 of $150.00");
  });
});
