import {
  BUDGET_WINDOWS,
  BudgetLimits,
  Event,
  Spend,
  budgetDecision,
  ceilingFor,
  spendSince,
} from "@amykit/core";

/**
 * What `amy budget` prints, as lines, so the arithmetic is testable.
 *
 * A pure function of the log rather than a method on the ledger: the ledger
 * answers one question — may this run start — and this answers the other one,
 * which is what a person asks when the answer to the first was no.
 */
export function budgetLines(
  events: readonly Event[],
  limits: BudgetLimits,
  now: Date,
): string[] {
  const lines: string[] = [];

  for (const window of BUDGET_WINDOWS) {
    const since = new Date(now.getTime() - window.ms);
    const spend = spendSince(events, since);
    const ceiling = ceilingFor(limits, window.name);

    lines.push(
      `${window.name.padEnd(14)} ${String(spend.runs).padStart(4)} run(s)  ` +
        `${against(spend.tokens, ceiling?.tokens, "tokens")}  ` +
        `${against(spend.costUsd, ceiling?.costUsd, "USD")}`,
    );

    const caveat = unpricedNote(spend, ceiling?.costUsd);
    if (caveat) lines.push(`${" ".repeat(14)} ${caveat}`);
  }

  const decision = budgetDecision(events, limits, now);
  lines.push(
    decision.ok
      ? "\nnew work: allowed"
      : `\nnew work: parked, ${decision.reason} ` +
          `(room again in ${Math.round(decision.retryAfterMs / 60000)} min)`,
  );

  return lines;
}

/**
 * How many runs in the window carry no price, where that changes the reading.
 *
 * Only under a dollar ceiling, because that is the only place the omission
 * misleads: a window metered in tokens has counted every run it saw. Under a
 * dollar ceiling the figure beside it is the spend of the priced runs and not
 * the spend of the window, and saying so is the difference between a number
 * that is arithmetically true and one that can be acted on.
 */
function unpricedNote(spend: Spend, ceiling: number | undefined): string | null {
  if (ceiling === undefined || spend.unpriced === 0) return null;

  return (
    `note: ${spend.unpriced} of those ${spend.runs} run(s) carry no price, so the USD ` +
    "figure is lower than the truth by an unknown amount. `amy models refresh` is what " +
    "fixes it, if the model is one the table has fallen behind on."
  );
}

/** `1,234 / 2,000 tokens (62%)`, or the spend alone when nothing caps it. */
function against(used: number, limit: number | undefined, unit: string): string {
  const spent = unit === "USD" ? `$${used.toFixed(2)}` : used.toLocaleString();
  if (limit === undefined) return `${spent} ${unit} (no ceiling)`;

  const cap = unit === "USD" ? `$${limit.toFixed(2)}` : limit.toLocaleString();
  const share = limit === 0 ? 100 : Math.round((used / limit) * 100);
  return `${spent} of ${cap} ${unit} (${share}%)`;
}
