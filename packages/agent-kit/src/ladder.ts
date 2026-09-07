import { AgentOutcome } from "@amykit/core";

export interface Rung {
  readonly name: string;
  readonly harness: string;
  readonly model: string;
  /**
   * This rung's runs arrive with a cost on them without the price table
   * being consulted.
   *
   * Declared by the harness plugin, because only it knows how its CLI
   * accounts: claude puts `total_cost_usd` in its envelope, and hermes
   * writes `cost_status: "included"` for a model that ran locally, where
   * zero is the right answer and no row in any price table would ever
   * exist. codex has the table and nothing else.
   *
   * Read by whoever asks whether a ceiling in money could stop anything.
   * Without it that question collapses into "is this model in the table",
   * which is a different question with the same answer only for codex —
   * and refusing an install whose costs arrive reported is the same failure
   * as an inert ceiling, arrived at from the other side.
   */
  readonly pricesItsOwnRuns?: boolean;
}

/**
 * Where to go after a rung did not work out, or nowhere.
 *
 * The two causes want opposite moves, which is the whole reason this is not a
 * plain retry loop:
 *
 * - **rate-limited** is not a capability problem. A stronger model on the
 *   same harness is still behind the same quota, so every remaining rung of
 *   that harness is skipped and the next harness gets it.
 * - **failed** might be a capability problem, so the next rung is tried in
 *   order: the next model of the same harness first, and only once those run
 *   out, the next harness. That is how both axes get exhausted rather than
 *   one.
 * - **abandoned** stops the ladder. A missing binary is one cause and
 *   `amy stop` killing the child is another, and retrying the second would
 *   start a fresh child the moment the handbrake came down. `amy doctor`
 *   is what catches the missing binary, before a ticket is touched.
 * - **completed** never asks.
 */
export function nextRung(
  ladder: readonly Rung[],
  current: number,
  outcome: AgentOutcome,
): number | null {
  if (outcome === "completed" || outcome === "abandoned") return null;

  const here = ladder[current];
  if (!here) return null;

  for (let index = current + 1; index < ladder.length; index += 1) {
    const rung = ladder[index]!;
    if (outcome === "rate-limited" && rung.harness === here.harness) continue;
    return index;
  }

  return null;
}
