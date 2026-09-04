import { describe, it, expect } from "vitest";
import { DEFAULT_STOP_AT, parseBudget } from "../src/index.js";

/** The problems, or a failure that says the config was wrongly accepted. */
function problemsOf(value: unknown): string[] {
  const parsed = parseBudget(value);
  expect(parsed.ok).toBe(false);
  return parsed.ok ? [] : parsed.problems;
}

describe("parseBudget", () => {
  it("reads the two windows and both measures", () => {
    const parsed = parseBudget({
      perFiveHours: { tokens: 2_000_000, costUsd: 20 },
      perWeek: { tokens: 30_000_000 },
      stopAt: 0.8,
    });

    expect(parsed).toEqual({
      ok: true,
      limits: {
        stopAt: 0.8,
        perFiveHours: { tokens: 2_000_000, costUsd: 20 },
        perWeek: { tokens: 30_000_000 },
      },
    });
  });

  it("means no ceiling when nothing is configured", () => {
    expect(parseBudget(undefined)).toEqual({ ok: true, limits: { stopAt: DEFAULT_STOP_AT } });
    expect(parseBudget({})).toEqual({ ok: true, limits: { stopAt: DEFAULT_STOP_AT } });
  });

  it("refuses a window it does not meter, and says which it does", () => {
    const problems = problemsOf({ perDay: { tokens: 10 } });

    expect(problems.join("\n")).toContain("perFiveHours, perWeek");
  });

  it("refuses a measure that is not one of the two", () => {
    expect(problemsOf({ perWeek: { minutes: 10 } }).join("\n")).toContain("budget.perWeek.minutes");
  });

  it("refuses a window that sets no ceiling at all", () => {
    expect(problemsOf({ perWeek: {} }).join("\n")).toContain("sets no ceiling");
  });

  it("refuses a negative ceiling", () => {
    expect(problemsOf({ perWeek: { costUsd: -1 } }).join("\n")).toContain("budget.perWeek.costUsd");
  });

  it("refuses a stopAt that could never fire, and one that never lets go", () => {
    expect(problemsOf({ stopAt: 1.5 }).join("\n")).toContain("budget.stopAt");
    expect(problemsOf({ stopAt: 0 }).join("\n")).toContain("budget.stopAt");
  });

  it("reports every problem rather than the first", () => {
    expect(problemsOf({ stopAt: 2, perWeek: { tokens: "lots" } })).toHaveLength(2);
  });

  it("keeps a ceiling of zero, which is a policy rather than a typo", () => {
    expect(parseBudget({ perWeek: { tokens: 0 } })).toMatchObject({
      ok: true,
      limits: { perWeek: { tokens: 0 } },
    });
  });
});
