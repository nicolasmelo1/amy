import { Harness } from "@amykit/core";
import { Agent } from "@amykit/workflow-ticket-to-qa";
import { Rung } from "./ladder.js";

/** The collection every harness plugin adds its ticket-shaped agents to. */
export const AGENT_COLLECTION = "agent";

/**
 * The collection every harness plugin adds the bare CLI to.
 *
 * Two collections rather than one, because they are two different things at
 * two different levels. A `NamedAgent` already knows what a ticket is, which
 * prompt to send and when to commit; a `NamedHarness` knows none of that and
 * is what a second workflow wants, so that its own prompts go up the same
 * ladder as the first workflow's do.
 */
export const HARNESS_COLLECTION = "harness";

/**
 * One harness at one model tier, ready to be asked.
 *
 * A harness plugin contributes one of these per model it was configured with,
 * rather than mounting the `agent` port. Only one plugin can own a port, and
 * three harnesses that each want to be *the* agent would simply refuse to
 * mount together. Contributing instead lets a relay compose them, and lets a
 * single-harness install work through the same relay with nothing special
 * about it.
 *
 * `harness` and `model` are declared rather than discovered, because the
 * relay has to decide **where to go next** before running anything: a quota
 * problem wants a different harness and a failure wants a stronger model, and
 * both are choices made in advance.
 */
export interface NamedAgent extends Rung {
  readonly agent: Agent;
  /**
   * The same harness and model, with a named skill doing the step.
   *
   * A second agent rather than an argument on the port, because which skill
   * answers is decided before the call, exactly like which harness does.
   */
  readonly using: (skill: string) => Agent;
}

/** The same rung of the same ladder, with no workflow's prompts on it. */
export interface NamedHarness extends Rung {
  readonly cli: Harness;
}
