import { AgentOutcome, CostSource, TokenUsage } from "@amy/core";

/** The shape `claude -p --output-format json` prints. */
export interface ClaudeEnvelope {
  result?: string;
  is_error?: boolean;
  api_error_status?: number | string | null;
  stop_reason?: string | null;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    /**
     * How the cache writes split by time to live.
     *
     * This is present in real envelopes and matters: a one-hour write is
     * billed at twice the input rate, so ignoring the split undercounts a
     * cache-heavy run badly. One real run had all 10,232 of its cache writes
     * at one hour, which is a 60% difference in the computed cost.
     */
    cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
  };
  modelUsage?: Record<string, unknown>;
}

export interface ParsedRun {
  outcome: AgentOutcome;
  text: string;
  model: string;
  tokens?: TokenUsage;
  costUsd?: number;
  costSource: CostSource;
  durationMs?: number;
}

/**
 * Reads the envelope, or says it could not.
 *
 * Returns null rather than throwing, because a harness that printed something
 * unexpected is a run to classify, not an exception to unwind.
 */
export function parseEnvelope(stdout: string): ClaudeEnvelope | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    return JSON.parse(trimmed) as ClaudeEnvelope;
  } catch {
    return null;
  }
}

/**
 * Which of the four outcomes this run was.
 *
 * Read off the envelope, not off stderr. A rate limit and a failure want
 * opposite responses, and guessing between them from log text is how a relay
 * ends up escalating to an expensive model over a quota problem.
 *
 * Known limit: a rate limit severe enough that no envelope is printed
 * classifies as `failed`. That is honest rather than clever — when a real
 * throttled envelope is in hand, its shape goes here.
 */
export function classify(envelope: ClaudeEnvelope | null, exitOk: boolean): AgentOutcome {
  if (!envelope) return exitOk ? "completed" : "abandoned";

  if (isRateLimit(envelope.api_error_status)) return "rate-limited";
  if (envelope.is_error === true || !exitOk) return "failed";

  return "completed";
}

function isRateLimit(status: number | string | null | undefined): boolean {
  if (status === undefined || status === null) return false;
  if (typeof status === "number") return status === 429;
  return status.includes("429");
}

/** The token counts, if the envelope carried them. */
export function tokensOf(envelope: ClaudeEnvelope | null): TokenUsage | undefined {
  const usage = envelope?.usage;
  if (!usage) return undefined;

  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens;

  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    ...(oneHour === undefined ? {} : { cacheWrite1h: oneHour }),
  };
}

/**
 * The model the run actually used.
 *
 * `modelUsage` is keyed by it, decorations and all, which is more truthful
 * than what was asked for: a fallback would have changed it.
 */
export function modelOf(envelope: ClaudeEnvelope | null, asked: string): string {
  const keys = Object.keys(envelope?.modelUsage ?? {});
  return keys[0] ?? asked;
}

export function parseRun(stdout: string, exitOk: boolean, asked: string): ParsedRun {
  const envelope = parseEnvelope(stdout);
  const tokens = tokensOf(envelope);
  const reported = envelope?.total_cost_usd;

  return {
    outcome: classify(envelope, exitOk),
    // The envelope puts the answer in `result`; without one, the raw output
    // is all there is.
    text: envelope?.result ?? stdout,
    model: modelOf(envelope, asked),
    tokens,
    costUsd: typeof reported === "number" ? reported : undefined,
    // The harness knows the plan and the discounts, so what it says beats
    // anything worked out from a price table.
    // Only ever `reported` or `unknown` here. Working a cost out from a
    // price table is the caller's job, and claiming `computed` without
    // computing would be the exact confusion `costSource` exists to prevent.
    costSource: typeof reported === "number" ? "reported" : "unknown",
    durationMs: envelope?.duration_ms,
  };
}
