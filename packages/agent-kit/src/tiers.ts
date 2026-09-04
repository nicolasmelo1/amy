import { Git, Registry } from "@amy/core";
import { AGENT_COLLECTION, NamedAgent } from "./collection.js";
import { Harness } from "./harness.js";
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
  git: Git;
  agent?: HarnessAgentConfig;
}

/**
 * Adds one agent per model tier to the collection the relay reads.
 *
 * Lives here rather than in each harness plugin because the naming is a
 * contract: the ladder in a config file refers to these names, so three
 * plugins inventing three conventions would make the config unlearnable.
 */
export function contributeTiers(registry: Registry, opts: TierOptions): NamedAgent[] {
  const models = opts.models.length > 0 ? opts.models : [""];

  return models.map((model) => {
    const agent = (skill?: string): HarnessAgent =>
      new HarnessAgent(opts.make(model), opts.git, { ...(opts.agent ?? {}), skill });

    const named: NamedAgent = {
      name: tierName(opts.harness, model),
      harness: opts.harness,
      model,
      agent: agent(),
      using: (skill) => agent(skill),
    };

    registry.contribute(AGENT_COLLECTION, named.name, named);
    return named;
  });
}

/** `claude:opus`, or plain `claude` when no model was named. */
export function tierName(harness: string, model: string): string {
  return model ? `${harness}:${model}` : harness;
}
