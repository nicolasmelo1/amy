import { Git, Harness, Registry } from "@amykit/core";
import { AGENT_COLLECTION, HARNESS_COLLECTION, NamedAgent, NamedHarness } from "./collection.js";
import { HarnessAgent, HarnessAgentConfig } from "./HarnessAgent.js";

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
  git: Git;
  agent?: HarnessAgentConfig;
}

/**
 * Adds one agent **and one bare harness** per model tier to the collections
 * the relay reads.
 *
 * Both, because they are used at different levels. The agent already knows
 * what a ticket is; the harness knows nothing, and is what a second workflow
 * asks its own questions through. Contributing only the first is what made
 * `@amykit/plugin-claude` a plugin exactly one workflow could use.
 *
 * The naming lives here rather than in each harness plugin because it is a
 * contract: the ladder in a config file refers to these names, so three
 * plugins inventing three conventions would make the config unlearnable. One
 * name covers both collections, so a ladder means the same thing whichever
 * level reads it.
 */
export function contributeTiers(registry: Registry, opts: TierOptions): NamedAgent[] {
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
    const cli = opts.make(model);
    const agent = (skill?: string): HarnessAgent =>
      new HarnessAgent(cli, opts.git, { ...(opts.agent ?? {}), skill });

    const rung = {
      name: tierName(opts.harness, model),
      harness: opts.harness,
      model,
      pricesItsOwnRuns: opts.pricesItsOwnRuns ?? false,
    };
    const named: NamedAgent = { ...rung, agent: agent(), using: (skill) => agent(skill) };
    const bare: NamedHarness = { ...rung, cli };

    registry.contribute(AGENT_COLLECTION, named.name, named);
    registry.contribute(HARNESS_COLLECTION, bare.name, bare);

    return named;
  });
}

/** `claude:opus`, or plain `claude` when no model was named. */
export function tierName(harness: string, model: string): string {
  return model ? `${harness}:${model}` : harness;
}
