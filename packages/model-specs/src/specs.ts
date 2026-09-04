import fs from "node:fs";
import path from "node:path";
import { TokenUsage, inputSideTokens } from "@amy/core";

export interface Rates {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken?: number;
  cacheWritePerToken?: number;
}

export interface ModelSpec extends Rates {
  provider: string;
  model: string;
  contextWindow?: number;
  /**
   * Above this many input-side tokens, every rate switches to
   * `aboveThreshold`.
   *
   * Measured on input plus cache reads plus cache writes, not on input alone,
   * and it re-rates the **whole** request rather than only the excess. Both
   * of those are easy to get wrong in the direction of undercounting.
   */
  thresholdTokens?: number;
  aboveThreshold?: Rates;
}

export interface SpecTable {
  source: string;
  note: string;
  models: ModelSpec[];
}

let table: SpecTable | null = null;

/** Where a refreshed table is kept, relative to the workspace it belongs to. */
export const OVERRIDE_PATH = ".amy/model-specs.json";

/**
 * The table in force: a local override if there is one, otherwise the
 * vendored default.
 *
 * The override exists because in a published install the vendored file lives
 * inside `node_modules`, and rewriting somebody's dependency in place is not
 * a refresh, it is a surprise. Read from disk rather than imported, so a
 * refresh takes effect without a rebuild.
 */
export function specTable(cwd: string = process.cwd()): SpecTable {
  if (table) return table;

  const override = path.join(cwd, OVERRIDE_PATH);
  const file = fs.existsSync(override) ? override : new URL("../specs.json", import.meta.url);

  table = JSON.parse(fs.readFileSync(file as string, "utf-8")) as SpecTable;
  return table;
}

/** For tests, and for `amy models refresh` to take effect in one process. */
export function forgetSpecTable(): void {
  table = null;
}

/**
 * Reduces a model id as a harness reports it to the id a price list uses.
 *
 * Harnesses decorate: `claude-opus-5[1m]` carries the context window,
 * `anthropic/claude-sonnet-4-5` carries the provider, and
 * `claude-haiku-4-5-20251001` carries the release date. Without this every
 * lookup misses and every cost is `unknown`.
 */
export function normalizeModelId(model: string): string[] {
  const lower = model.trim().toLowerCase();
  const withoutProvider = lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;
  const withoutWindow = withoutProvider.replace(/\[[^\]]*\]$/, "");

  const candidates = [withoutWindow];

  // A dated release prices the same as the family it belongs to, so the
  // undated id is the fallback rather than a miss.
  const undated = withoutWindow.replace(/-\d{8}$/, "");
  if (undated !== withoutWindow) candidates.push(undated);

  return candidates;
}

/** The spec for a model, or nothing, which is a real answer. */
export function specFor(model: string, from: SpecTable = specTable()): ModelSpec | undefined {
  for (const candidate of normalizeModelId(model)) {
    const found = from.models.find((spec) => spec.model === candidate);
    if (found) return found;
  }
  return undefined;
}

/**
 * What those tokens cost at those rates.
 *
 * The one-hour cache write is billed at twice the input rate, which is not
 * something any of the four rate fields expresses.
 */
export function costOf(spec: ModelSpec, tokens: TokenUsage): number {
  const above =
    spec.thresholdTokens !== undefined && inputSideTokens(tokens) > spec.thresholdTokens;
  const rates: Rates = above && spec.aboveThreshold ? { ...spec, ...spec.aboveThreshold } : spec;

  const inputRate = rates.inputPerToken;
  const cacheReadRate = rates.cacheReadPerToken ?? inputRate;
  const cacheWriteRate = rates.cacheWritePerToken ?? inputRate;

  const write1h = Math.min(Math.max(tokens.cacheWrite1h ?? 0, 0), Math.max(tokens.cacheWrite, 0));
  const write5m = Math.max(tokens.cacheWrite, 0) - write1h;

  return (
    Math.max(tokens.input, 0) * inputRate +
    Math.max(tokens.cacheRead, 0) * cacheReadRate +
    write5m * cacheWriteRate +
    write1h * inputRate * 2 +
    Math.max(tokens.output, 0) * rates.outputPerToken
  );
}
