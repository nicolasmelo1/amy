import { Harness } from "@amykit/core";
import { Rung } from "./ladder.js";

/**
 * The collection every harness plugin adds its CLI to, one per model tier.
 *
 * A harness plugin contributes rather than mounting the `agent` port: only
 * one plugin can own a port, and three harnesses that each wanted to be *the*
 * agent would refuse to mount together. The relay composes what is
 * contributed, and a single-harness install goes through the same relay.
 *
 * `harness` and `model` are declared rather than discovered, because the
 * relay has to decide **where to go next** before running anything: a quota
 * problem wants a different harness and a failure wants a stronger model.
 */
export const HARNESS_COLLECTION = "harness";

/** One rung of the ladder: a harness at one model, with nobody's prompts on it. */
export interface NamedHarness extends Rung {
  readonly cli: Harness;
}
