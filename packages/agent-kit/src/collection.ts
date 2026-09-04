import { Agent } from "@amy/workflow-ticket-to-qa";

/** The collection every harness plugin adds itself to. */
export const AGENT_COLLECTION = "agent";

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
export interface NamedAgent {
  /** How the ladder refers to it, such as `claude:sonnet`. */
  readonly name: string;
  readonly harness: string;
  readonly model: string;
  readonly agent: Agent;
  /**
   * The same harness and model, with a named skill doing the step.
   *
   * A second agent rather than an argument on the port, because which skill
   * answers is decided before the call, exactly like which harness does.
   */
  readonly using: (skill: string) => Agent;
}
