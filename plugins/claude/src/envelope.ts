import { AgentOutcome, CostSource, TokenUsage } from "@amykit/core";

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

/**
 * What a `--output-format stream-json` run said, read after it exits.
 *
 * The stream prints one JSON event a line. The last `result` event is the
 * envelope `--output-format json` would have printed, and a `rate_limit_event`
 * whose `rate_limit_info.status` is `rejected` is the plan refusing the turn,
 * whatever the result line says.
 */
export interface ClaudeStream {
  /** The envelope the stream carried, when it carried one. */
  result: ClaudeEnvelope | null;
  /** A rate_limit_event said the plan refused this turn. */
  rejected: boolean;
  /** A result line reported a 429, wherever in the stream it was. */
  throttled: boolean;
  /** The epoch-second reset that event reported, when it reported one. */
  resetsAt?: number;
}

export interface ParsedRun {
  outcome: AgentOutcome;
  text: string;
  model: string;
  tokens?: TokenUsage;
  costUsd?: number;
  costSource: CostSource;
  durationMs?: number;
  /** How long the plan said the wait lasts, when a rejected event said. */
  retryAfterMs?: number;
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
 * Reads a `stream-json` run, one JSON event a line.
 *
 * A line that is not JSON is skipped: the run is read from the lines that are,
 * which is what the json format did with anything that was not an envelope.
 * The last `result` event wins, because that is the envelope the run ended
 * with, and the last rejected event wins for the same reason.
 */
export function parseStream(stdout: string): ClaudeStream {
  let result: ClaudeEnvelope | null = null;
  let rejected = false;
  let throttled = false;
  let resetsAt: number | undefined;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (event.type === "result") {
      result = event as ClaudeEnvelope;
      if (isRateLimit((event as ClaudeEnvelope).api_error_status)) throttled = true;
    }
    if (event.type !== "rate_limit_event") continue;

    const refusal = refusalOf(event);
    if (!refusal) continue;

    rejected = true;
    // The latest reset any refusal reported: two windows can refuse at once
    // and a step may only rerun once every one of them reopened, so an event
    // that reports no reset must not erase the one another named.
    if (refusal.resetsAt !== undefined) {
      resetsAt = resetsAt === undefined ? refusal.resetsAt : Math.max(resetsAt, refusal.resetsAt);
    }
  }

  return { result, rejected, throttled, ...(resetsAt === undefined ? {} : { resetsAt }) };
}

/**
 * The refusal a `rate_limit_event` reports, or nothing when it reports none.
 *
 * A rejected window with `overageStatus: "allowed"` is not a refusal: the turn
 * runs on usage credits and finishes, so there is nothing to wait for.
 */
function refusalOf(event: Record<string, unknown>): { resetsAt?: number } | undefined {
  const info = event.rate_limit_info as
    | { status?: unknown; resetsAt?: unknown; overageStatus?: unknown }
    | undefined;
  if (info?.status !== "rejected" || info.overageStatus === "allowed") return undefined;

  const resetsAt = typeof info.resetsAt === "number" && Number.isFinite(info.resetsAt) ? info.resetsAt : undefined;
  return resetsAt === undefined ? {} : { resetsAt };
}

/**
 * Which of the four outcomes this run was.
 *
 * Read off the envelope, not off stderr. A rate limit and a failure want
 * opposite responses, and guessing between them from log text is how a relay
 * ends up escalating to an expensive model over a quota problem.
 */
export function classify(envelope: ClaudeEnvelope | null, exitOk: boolean): AgentOutcome {
  if (!envelope) return exitOk ? "completed" : "abandoned";

  if (isRateLimit(envelope.api_error_status)) return "rate-limited";
  if (envelope.is_error === true || !exitOk) return "failed";

  return "completed";
}

/**
 * The outcome of a whole stream.
 *
 * A rejected `rate_limit_event` settles it before anything else is read: the
 * plan refusing a turn is a quota answer whatever the result line says, and a
 * run killed right after the refusal is still a limit rather than an
 * abandoned run that would start another child over the same quota.
 */
export function classifyStream(stream: ClaudeStream, exitOk: boolean): AgentOutcome {
  if (stream.rejected || stream.throttled) return "rate-limited";
  return classify(stream.result, exitOk);
}

/**
 * How long the stream said to wait, in milliseconds.
 *
 * Absent rather than zero when the reset is missing, unreadable or already in
 * the past: the policy's own backoff is the honest answer then, and a zero
 * wait would rerun into the same refusal.
 */
export function retryAfterOf(stream: ClaudeStream, now = Date.now()): number | undefined {
  if (!stream.rejected || stream.resetsAt === undefined) return undefined;

  const wait = stream.resetsAt * 1000 - now;
  return wait > 0 ? wait : undefined;
}

function isRateLimit(status: number | string | null | undefined): boolean {
  if (status === undefined || status === null) return false;
  if (typeof status === "number") return status === 429;
  return status.includes("429");
}

/**
 * What the CLI printed that was not an event line.
 *
 * A stream that ended without a result line has no answer to hand back, and
 * its events are not one: they carry tool calls and tool results, file
 * contents among them, and a rerun would fold all of that into its prompt.
 */
function prose(stdout: string): string {
  const kept = stdout.split("\n").filter((line) => line.trim() !== "" && !line.trim().startsWith("{"));
  return kept.join("\n").trim();
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

export function parseRun(stdout: string, exitOk: boolean, asked: string, now = Date.now()): ParsedRun {
  const stream = parseStream(stdout);
  const envelope = stream.result;
  const tokens = tokensOf(envelope);
  const reported = envelope?.total_cost_usd;
  const retryAfterMs = retryAfterOf(stream, now);

  return {
    outcome: classifyStream(stream, exitOk),
    // The envelope puts the answer in `result`; without one, the CLI's prose
    // is all there is, never the events themselves.
    text: envelope?.result ?? prose(stdout),
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
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}
