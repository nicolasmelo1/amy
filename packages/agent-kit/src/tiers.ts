import { Harness, Registry } from "@amykit/core";
import { HARNESS_COLLECTION, NamedHarness } from "./collection.js";

export interface TierOptions {
  /** The harness name, which is also the axis the relay swaps along. */
  harness: string;
  /**
   * The model tiers, cheapest first. Empty means one agent on whatever model
   * the harness defaults to, which is the single-model install.
   */
  models: readonly string[];
  make: (model: string) => Harness;
  /** See `Rung.pricesItsOwnRuns`. Declared once per harness, not per tier. */
  pricesItsOwnRuns?: boolean;
}

/**
 * Adds one harness per model tier to the collection the relay reads.
 *
 * The naming lives here rather than in each harness plugin because it is a
 * contract: the ladder in a config file refers to these names, so three
 * plugins inventing three conventions would make the config unlearnable.
 */
export function contributeTiers(registry: Registry, opts: TierOptions): NamedHarness[] {
  // The union the config sent can name a model twice — `ladder` and a step's
  // own both saying `claude:opus` is the shape `amy init` ships. A rung is a
  // name in a collection here, and a second contribution under a name already
  // present is refused at boot. Dedupe, keeping the first mention: a ladder
  // is ordered, and the first mention is the one that means something.
  const seen = new Set<string>();
  const models = opts.models.filter((model) => {
    const key = `${model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (models.length === 0) models.push("");

  return models.map((model) => {
    const named: NamedHarness = {
      name: tierName(opts.harness, model),
      harness: opts.harness,
      model,
      pricesItsOwnRuns: opts.pricesItsOwnRuns ?? false,
      cli: opts.make(model),
    };
    registry.contribute(HARNESS_COLLECTION, named.name, named);
    return named;
  });
}

/** `claude:opus`, or plain `claude` when no model was named. */
export function tierName(harness: string, model: string): string {
  return model ? `${harness}:${model}` : harness;
}
