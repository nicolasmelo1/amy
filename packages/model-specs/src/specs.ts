import fs from "node:fs";
import path from "node:path";
import { TokenUsage, inputSideTokens } from "@amykit/core";

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
  /**
   * The short names a harness CLI accepts, and the id each one stands for.
   *
   * `claude --model sonnet` is documented as "an alias for the latest model",
   * and a ladder is written in those names because that is what the config
   * passes through. Without this, every rung in the shipped template looks
   * unpriceable.
   *
   * Only ever consulted to answer *whether a ladder can be priced at all*.
   * What a run cost is worked out from the id the harness reported, which is
   * the full dated one, so an alias that drifts a version costs nobody a
   * cent — it would only make a boot check look at the wrong row of a table
   * where both rows are priced.
   */
  aliases?: Record<string, string>;
  models: ModelSpec[];
}

let table: SpecTable | null = null;

/** What a refreshed table is called, inside the state directory it belongs to. */
export const OVERRIDE_FILE = "model-specs.json";

/**
 * The table in force: a local override if there is one, otherwise the
 * vendored default.
 *
 * The override exists because in a published install the vendored file lives
 * inside `node_modules`, and rewriting somebody's dependency in place is not
 * a refresh, it is a surprise. Read from disk rather than imported, so a
 * refresh takes effect without a rebuild.
 */
export function specTable(stateDir?: string): SpecTable {
  if (table) return table;

  // No state directory means nowhere an override could be, which is what a
  // library call looks like: the vendored table, and no file system guess.
  const override = stateDir ? path.join(stateDir, OVERRIDE_FILE) : "";
  const file =
    override && fs.existsSync(override) ? override : new URL("../specs.json", import.meta.url);

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
 *
 * People decorate too. A version is written `4.5` everywhere it is spoken
 * about and `4-5` in every id, and a ladder is written by hand.
 */
export function normalizeModelId(model: string): string[] {
  const lower = model.trim().toLowerCase();
  const withoutProvider = lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;
  const withoutWindow = withoutProvider.replace(/\[[^\]]*\]$/, "");
  const dashed = withoutWindow.replace(/(\d)\.(\d)/g, "$1-$2");

  const candidates = [dashed];

  // A dated release prices the same as the family it belongs to, so the
  // undated id is the fallback rather than a miss.
  const undated = dashed.replace(/-\d{8}$/, "");
  if (undated !== dashed) candidates.push(undated);

  return candidates;
}

/**
 * The id a short name stands for, or the name unchanged.
 *
 * Kept out of `specFor` on purpose. Costing a run from an alias would put a
 * guess about which version ran behind a number that is then spent against a
 * ceiling, and the harness always reports the real id. This exists for the
 * one question an alias can answer honestly: whether a ladder written in
 * short names is a ladder this table could price.
 */
export function aliasFor(model: string, from: SpecTable = specTable()): string {
  const aliases = from.aliases ?? {};

  for (const candidate of normalizeModelId(model)) {
    const named = aliases[candidate];
    if (named) return named;
  }

  return model;
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
