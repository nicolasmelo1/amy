/** A ceiling over one window. Either measure may be left out, or both set. */
export interface WindowLimit {
  tokens?: number;
  costUsd?: number;
}

/**
 * What an operator is willing to spend, and how close to it work may get.
 *
 * Two ceilings, because they are different currencies. Tokens are what a
 * subscription meters and what blocks at three in the morning; dollars are
 * what matters when the spending goes through an API key.
 */
export interface BudgetLimits {
  /** The rolling five hours a subscription plan meters. */
  perFiveHours?: WindowLimit;
  perWeek?: WindowLimit;
  /** The fraction of a ceiling at which new work stops being started. */
  stopAt: number;
}

export type BudgetMeasure = "tokens" | "costUsd";

export type BudgetDecision =
  | { ok: true }
  | {
      ok: false;
      /** Which window is spent, named as the operator configured it. */
      window: string;
      measure: BudgetMeasure;
      used: number;
      limit: number;
      stopAt: number;
      /** How long until that window has room again. */
      retryAfterMs: number;
      /** One line, written to be read by a person in the log. */
      reason: string;
    };

/**
 * Whether work that spends an agent may start.
 *
 * Asked before the call rather than after it, because a ceiling checked
 * afterwards is a report, not a brake.
 */
export interface Budget {
  mayStart(now: Date): BudgetDecision;
}
