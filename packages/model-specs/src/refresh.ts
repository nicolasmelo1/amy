import { ModelSpec, SpecTable } from "./specs.js";

export const MODELS_DEV_URL = "https://models.dev/api.json";

/** The slice of models.dev's api.json this reads. Everything else is ignored. */
export interface ModelsDevCatalog {
  [providerId: string]: {
    id?: string;
    models?: {
      [modelId: string]: {
        cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
        limit?: { context?: number };
      };
    };
  };
}

export interface RefreshChange {
  model: string;
  was: number;
  now: number;
  field: string;
}

export interface RefreshReport {
  table: SpecTable;
  changed: RefreshChange[];
  /** In the table, and models.dev no longer knows it. Left alone, reported. */
  unmatched: string[];
}

/**
 * Whether two rates differ by more than the arithmetic that produced them.
 *
 * Dividing by a million and back again does not round-trip exactly, and
 * reporting "$0.10 -> $0.10" as a change is worse than reporting nothing: it
 * teaches the reader to skim the list that is supposed to be reviewed.
 */
function materiallyDiffers(was: number, now: number): boolean {
  const scale = Math.max(Math.abs(was), Math.abs(now));
  return Math.abs(was - now) > scale * 1e-9;
}

/** models.dev quotes dollars per million tokens; a rate here is per token. */
function perToken(perMillion: number | undefined): number | undefined {
  return perMillion === undefined ? undefined : perMillion / 1_000_000;
}

/**
 * Finds a model in the catalogue, allowing for the dated id it is filed under.
 *
 * The table keeps family ids like `claude-sonnet-4-5`; models.dev keys on
 * `claude-sonnet-4-5-20250929`. Without the prefix match every model would
 * come back unmatched.
 */
function findInCatalog(
  catalog: ModelsDevCatalog,
  spec: ModelSpec,
): { input?: number; output?: number; cache_read?: number; cache_write?: number; context?: number } | null {
  const models = catalog[spec.provider]?.models ?? {};

  const exact = models[spec.model];
  const dated = Object.keys(models)
    .filter((id) => id.startsWith(`${spec.model}-`))
    .sort()
    .at(-1);
  const entry = exact ?? (dated ? models[dated] : undefined);

  if (!entry?.cost) return null;
  return { ...entry.cost, context: entry.limit?.context };
}

/**
 * Rewrites the base rates from models.dev, and keeps what models.dev does not
 * carry.
 *
 * Long-context tiering is the reason this is not a straight replacement:
 * models.dev publishes one rate per token kind and says nothing about the
 * threshold above which every rate changes. Overwriting the table wholesale
 * would drop that and make a 200k-token request look cheaper than it is,
 * which is the one direction a cost estimate must never be wrong in.
 *
 * Pure, so what a refresh would change can be shown before anything is
 * written.
 */
export function refreshFrom(catalog: ModelsDevCatalog, current: SpecTable): RefreshReport {
  const changed: RefreshChange[] = [];
  const unmatched: string[] = [];

  const models = current.models.map((spec) => {
    const found = findInCatalog(catalog, spec);
    if (!found) {
      unmatched.push(spec.model);
      return spec;
    }

    const next: ModelSpec = {
      ...spec,
      inputPerToken: perToken(found.input) ?? spec.inputPerToken,
      outputPerToken: perToken(found.output) ?? spec.outputPerToken,
      cacheReadPerToken: perToken(found.cache_read) ?? spec.cacheReadPerToken,
      cacheWritePerToken: perToken(found.cache_write) ?? spec.cacheWritePerToken,
      contextWindow: found.context ?? spec.contextWindow,
      // Kept, deliberately. See above.
      thresholdTokens: spec.thresholdTokens,
      aboveThreshold: spec.aboveThreshold,
    };

    for (const field of ["inputPerToken", "outputPerToken", "cacheReadPerToken", "cacheWritePerToken"] as const) {
      const was = spec[field];
      const now = next[field];
      if (was !== undefined && now !== undefined && materiallyDiffers(was, now)) {
        changed.push({ model: spec.model, field, was, now });
      }
    }

    return next;
  });

  return {
    table: { ...current, source: `${MODELS_DEV_URL} (base rates), tiering kept from the vendored table`, models },
    changed,
    unmatched,
  };
}
