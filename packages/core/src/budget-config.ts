import { BudgetLimits, WindowLimit } from "./ports/Budget.js";

/** The fraction of a ceiling at which new work stops, unless configured. */
export const DEFAULT_STOP_AT = 0.9;

/** The windows a ceiling may be set over, and nothing else is accepted. */
const WINDOWS = ["perFiveHours", "perWeek"] as const;
const MEASURES = ["tokens", "costUsd"] as const;

export type BudgetResult =
  | { ok: true; limits: BudgetLimits }
  | { ok: false; problems: string[] };

/**
 * Reads a `budget` setting, refusing anything it cannot mean.
 *
 * `ConfigSchema` stops at "this is a mapping", because five field types are
 * enough for every other plugin and a nested shape wants its own validation.
 * This is that validation, kept next to the ledger it feeds so the plugin
 * that takes the setting and the command that prints it read one parser.
 */
export function parseBudget(value: unknown): BudgetResult {
  if (value === undefined) return { ok: true, limits: { stopAt: DEFAULT_STOP_AT } };
  if (!isRecord(value)) return { ok: false, problems: ["`budget` must be a mapping"] };

  const problems: string[] = [];
  const limits: BudgetLimits = { stopAt: stopAtIn(value, problems) };

  for (const window of WINDOWS) {
    const given = value[window];
    if (given === undefined) continue;

    const ceiling = windowIn(window, given, problems);
    if (ceiling) limits[window] = ceiling;
  }

  for (const field of Object.keys(value)) {
    if (field !== "stopAt" && !WINDOWS.includes(field as (typeof WINDOWS)[number])) {
      problems.push(`\`budget.${field}\` is not a window this plugin meters: ${WINDOWS.join(", ")}`);
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, limits };
}

/**
 * The fraction of a ceiling at which new work stops.
 *
 * Above one it could never fire, and at or below zero it would never let
 * anything start, so both are typos rather than policies.
 */
function stopAtIn(value: Record<string, unknown>, problems: string[]): number {
  const given = value.stopAt;
  if (given === undefined) return DEFAULT_STOP_AT;

  if (typeof given !== "number" || !Number.isFinite(given) || given <= 0 || given > 1) {
    problems.push("`budget.stopAt` must be a fraction above 0 and at most 1, such as 0.9");
    return DEFAULT_STOP_AT;
  }

  return given;
}

function windowIn(window: string, given: unknown, problems: string[]): WindowLimit | null {
  if (!isRecord(given)) {
    problems.push(`\`budget.${window}\` must be a mapping of tokens and costUsd`);
    return null;
  }

  const ceiling: WindowLimit = {};
  let named = 0;

  for (const measure of MEASURES) {
    const amount = given[measure];
    if (amount === undefined) continue;
    named += 1;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      problems.push(`\`budget.${window}.${measure}\` must be a number of ${measure} at or above 0`);
      continue;
    }
    ceiling[measure] = amount;
  }

  for (const field of Object.keys(given)) {
    if (!MEASURES.includes(field as (typeof MEASURES)[number])) {
      problems.push(`\`budget.${window}.${field}\` is not a measure: ${MEASURES.join(", ")}`);
    }
  }

  // A window naming neither measure reads like a budget and is not one. A
  // window that named one badly has already been complained about, and
  // saying it twice would only hide the first line.
  if (named === 0) {
    problems.push(`\`budget.${window}\` sets no ceiling: give it tokens, costUsd, or both`);
  }

  return Object.keys(ceiling).length > 0 ? ceiling : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The ceiling configured for one window, if any. */
export function ceilingFor(limits: BudgetLimits, window: string): WindowLimit | undefined {
  return window === "perFiveHours" ? limits.perFiveHours : limits.perWeek;
}
