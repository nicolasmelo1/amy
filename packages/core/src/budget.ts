import { billableTokens } from "./agent-run.js";
import { ceilingFor } from "./budget-config.js";
import {
  Budget,
  BudgetDecision,
  BudgetLimits,
  BudgetMeasure,
  WindowLimit,
} from "./ports/Budget.js";
import { Event, EventLog } from "./ports/EventLog.js";

export interface BudgetWindow {
  name: string;
  ms: number;
}

/**
 * The windows a ceiling can be set over.
 *
 * Their durations are fixed because they are not preferences: five hours is
 * the session window a subscription meters, and a week is the other one it
 * meters. What an operator configures is the ceiling in each.
 */
export const BUDGET_WINDOWS: readonly BudgetWindow[] = [
  { name: "perFiveHours", ms: 5 * 60 * 60 * 1000 },
  { name: "perWeek", ms: 7 * 24 * 60 * 60 * 1000 },
];

const MEASURES: readonly BudgetMeasure[] = ["tokens", "costUsd"];

export interface Spend {
  tokens: number;
  /** Only money somebody measured or worked out. See `moneyIn`. */
  costUsd: number;
  runs: number;
  /**
   * How many of those runs nobody could put a price on.
   *
   * `costUsd` above is arithmetically true and, with this above zero,
   * practically a lie: it is the spend of the runs that were priced and not
   * the spend of the window. A reader who is not told how many were left out
   * reads a dollar figure that is lower than the truth by an unknown amount.
   */
  unpriced: number;
  /** The oldest run counted, which is when the window starts to clear. */
  oldestAt?: string;
}

/**
 * What the agent runs since an instant added up to.
 *
 * Read from the log rather than from a counter of its own, because a second
 * tally is a second thing to disagree with what actually happened.
 */
export function spendSince(events: readonly Event[], since: Date): Spend {
  const spend: Spend = { tokens: 0, costUsd: 0, runs: 0, unpriced: 0 };
  const cutoff = since.getTime();

  for (const event of events) {
    if (event.kind !== "agent.run") continue;
    if (new Date(event.at).getTime() < cutoff) continue;

    const detail = event.detail ?? {};
    const price = priceOf(detail);

    spend.runs += 1;
    spend.tokens += tokensIn(detail);
    spend.costUsd += price ?? 0;
    if (price === undefined) spend.unpriced += 1;
    if (!spend.oldestAt || event.at < spend.oldestAt) spend.oldestAt = event.at;
  }

  return spend;
}

/**
 * Whether a run may start, and if not, which ceiling stopped it.
 *
 * Windows are asked in the order they are declared and the first one over
 * its `stopAt` answers, so the same log and the same limits always give the
 * same reason.
 */
export function budgetDecision(
  events: readonly Event[],
  limits: BudgetLimits,
  now: Date,
): BudgetDecision {
  for (const window of BUDGET_WINDOWS) {
    const ceiling = ceilingFor(limits, window.name);
    if (!ceiling) continue;

    const spend = spendSince(events, new Date(now.getTime() - window.ms));
    const refusal = blown(window, ceiling, spend, limits.stopAt, now);
    if (refusal) return refusal;
  }

  return { ok: true };
}

export function hasACeiling(limits: BudgetLimits): boolean {
  return BUDGET_WINDOWS.some((window) => ceilingFor(limits, window.name) !== undefined);
}

/** The budget, read from the event log every time it is asked. */
export class LogBudget implements Budget {
  constructor(
    private readonly log: EventLog,
    private readonly limits: BudgetLimits,
  ) {}

  mayStart(now: Date): BudgetDecision {
    if (!hasACeiling(this.limits)) return { ok: true };

    // Only as far back as the longest window, so the read does not grow with
    // the age of the install.
    const longest = Math.max(...BUDGET_WINDOWS.map((window) => window.ms));
    const since = new Date(now.getTime() - longest);

    return budgetDecision(this.log.read(since), this.limits, now);
  }
}

function blown(
  window: BudgetWindow,
  ceiling: WindowLimit,
  spend: Spend,
  stopAt: number,
  now: Date,
): BudgetDecision | null {
  for (const measure of MEASURES) {
    const limit = measure === "tokens" ? ceiling.tokens : ceiling.costUsd;
    if (limit === undefined) continue;

    const used = measure === "tokens" ? spend.tokens : spend.costUsd;
    if (used < limit * stopAt) continue;

    return {
      ok: false,
      window: window.name,
      measure,
      used,
      limit,
      stopAt,
      retryAfterMs: clearsIn(spend, window, now),
      reason:
        `the ${window.name} budget has spent ${used} of its ${limit} ${measure} ceiling, ` +
        `and new work stops at ${Math.round(stopAt * 100)}%`,
    };
  }

  return null;
}

/**
 * When the window next has room: the moment its oldest run falls out of it.
 *
 * With nothing in the window at all the ceiling itself must be zero, and the
 * whole window is the honest answer.
 */
function clearsIn(spend: Spend, window: BudgetWindow, now: Date): number {
  if (!spend.oldestAt) return window.ms;

  const leaves = new Date(spend.oldestAt).getTime() + window.ms - now.getTime();
  return Math.max(leaves, 1000);
}

function tokensIn(detail: Record<string, unknown>): number {
  const tokens = detail.tokens;
  if (!isRecord(tokens)) return 0;

  // Billable, not total: a cache read is context already paid for, and
  // counting it here parked this machine for five hours after a single run.
  // See `billableTokens`.
  return billableTokens({
    input: numberAt(tokens, "input"),
    output: numberAt(tokens, "output"),
    cacheRead: numberAt(tokens, "cacheRead"),
    cacheWrite: numberAt(tokens, "cacheWrite"),
  });
}

/**
 * What a run cost, or nothing at all, which is a different thing from zero.
 *
 * `unknown` moves the token ceiling and not this one. Adding up a figure
 * nobody measured would invent the number that decides when to stop, so it
 * returns undefined and the window counts it as unpriced instead.
 *
 * `included` is a real zero: the subscription already paid for it, and a
 * window full of those is fully accounted for rather than unknown.
 */
function priceOf(detail: Record<string, unknown>): number | undefined {
  const source = detail.costSource;
  if (source === "included") return 0;
  if (source !== "reported" && source !== "computed") return undefined;

  const cost = detail.costUsd;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberAt(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
