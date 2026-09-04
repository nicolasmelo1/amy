export type AgentOutcome =
  /** It did the work and said so. */
  | "completed"
  /** It ran and did not succeed. A capability problem, possibly. */
  | "failed"
  /**
   * It was cut off by a quota, not by the work.
   *
   * Kept apart from `failed` because the two want opposite responses: a
   * rate limit is not a capability problem, so a stronger model does not help
   * and another harness does.
   */
  | "rate-limited"
  /** It never really ran: the harness was missing, or it was killed. */
  | "abandoned";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /**
   * The part of `cacheWrite` written with the one-hour time to live, which
   * every price list bills at twice the input rate.
   */
  cacheWrite1h?: number;
}

/**
 * Where a cost figure came from.
 *
 * Lifted from Hermes, which writes `cost_source` next to its
 * `estimated_cost_usd` rather than presenting an estimate as a measurement.
 * Without this field a number computed from a stale price table and a number
 * the harness itself reported are indistinguishable, and a budget cannot tell
 * you which of its two ceilings it actually trusts.
 */
export type CostSource =
  /** The harness said what it cost. It knows the plan and the discounts. */
  | "reported"
  /** Worked out from the token counts and a price table. */
  | "computed"
  /**
   * A subscription covered it, so the run cost no money at all.
   *
   * Not the same as `unknown`: zero here is the right answer rather than a
   * missing one. Hermes reports this as `cost_status: "included"`, and the
   * distinction matters because such a run still spends quota — which is why
   * the token ceiling is the one that stops work on a plan.
   */
  | "included"
  /** Nobody knows. `costUsd` is absent, and that is the honest answer. */
  | "unknown";

export interface AgentRun {
  outcome: AgentOutcome;
  harness: string;
  model: string;
  /**
   * Absent when the harness did not say. Never estimated: a guessed token
   * count that a budget then spends against is worse than no number.
   */
  tokens?: TokenUsage;
  costUsd?: number;
  costSource: CostSource;
  durationMs: number;
  /** Whatever the harness said, verbatim, because it is the next prompt. */
  output: string;
}

/**
 * What an agent gives back: the thing that was asked for, and the account of
 * what it took to get it.
 *
 * One envelope over a generic value, so the three agent methods each keep
 * their own return type instead of three separate shapes growing three
 * separate accounting fields.
 */
export interface AgentResult<T> {
  value: T;
  run: AgentRun;
}

/** Nothing was spent, or nothing is known about what was. */
export const NO_TOKENS: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function totalTokens(tokens: TokenUsage): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
}

/** The input side, which is what a long-context threshold is measured against. */
export function inputSideTokens(tokens: TokenUsage): number {
  return tokens.input + tokens.cacheRead + tokens.cacheWrite;
}
