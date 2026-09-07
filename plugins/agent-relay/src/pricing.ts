import { BUDGET_WINDOWS, BudgetLimits, ceilingFor } from "@amykit/core";
import { Ladders, Rung, everyRung } from "@amykit/agent-kit";
import { SpecTable, aliasFor, specFor, specTable } from "@amykit/model-specs";

/** A rung the price table has nothing to say about. */
export interface UnpricedRung {
  /** The ladder entry, as the config wrote it: `claude:sonnet`. */
  readonly rung: string;
  /** The model that entry names, or empty when it named none. */
  readonly model: string;
}

/** Whether any window caps money, which is the only ceiling a price can break. */
export function capsMoney(limits: BudgetLimits): boolean {
  return BUDGET_WINDOWS.some((window) => ceilingFor(limits, window.name)?.costUsd !== undefined);
}

/**
 * The rungs no price table entry covers, in ladder order and named once each.
 *
 * Every step's ladder, not just the default: a model named only under
 * `ladderByStep.implement` is the model that does the expensive half of the
 * work, and it is the one whose cost going missing matters most.
 */
export function unpricedRungs<T extends Rung>(
  ladders: Ladders<T>,
  table: SpecTable = specTable(),
): UnpricedRung[] {
  const found: UnpricedRung[] = [];
  const seen = new Set<string>();

  for (const rung of everyRung(ladders)) {
    if (seen.has(rung.name)) continue;
    seen.add(rung.name);

    // The harness accounts for itself, so the table is a backstop it may
    // never reach and a missing row costs the ceiling nothing. Asked before
    // the table, because for these two the table's answer is not the
    // question: claude reports `total_cost_usd`, and a hermes run on a local
    // model is `included` at zero, which no price list will ever carry.
    if (rung.pricesItsOwnRuns) continue;

    if (specFor(aliasFor(rung.model, table), table)) continue;
    found.push({ rung: rung.name, model: rung.model });
  }

  return found;
}

/**
 * Why a dollar ceiling over this ladder could not stop anything, or nothing.
 *
 * A ceiling in `costUsd` is only a ceiling if the runs underneath it arrive
 * with a price on them. When the table cannot price a rung, that rung's runs
 * are recorded with no `costUsd`, the dollar figure never moves, and the
 * ceiling written in the config is not loose — it is inert. The token ceiling
 * beside it still fires, which is what makes it quiet: the machine does stop
 * sometimes, just never for the reason that was written down.
 *
 * So it is refused where a typo in a ladder is refused, and for the same
 * reason: while boot can still refuse, rather than three weeks later when
 * somebody reads the bill.
 *
 * Pure, and told the table rather than reading it, so a test can hand it a
 * table with a hole in a known place.
 */
export function inertCeilingProblems<T extends Rung>(
  limits: BudgetLimits,
  ladders: Ladders<T>,
  table: SpecTable = specTable(),
): string[] {
  // A ceiling in tokens needs no price table at all. Tokens are what a
  // subscription meters, they are reported by every harness that runs, and an
  // install that wants a ceiling without one of these arguments has it.
  if (!capsMoney(limits)) return [];

  const unpriced = unpricedRungs(ladders, table);
  if (unpriced.length === 0) return [];

  return unpriced.map(
    ({ rung, model }) =>
      `\`budget\` sets a costUsd ceiling, and ${named(model)} — which the rung \`${rung}\` ` +
      "names — is not in the price table, and this harness reports no cost of its own, so " +
      "runs on it would be recorded with no cost and that ceiling could never stop " +
      "anything. `amy models refresh` re-rates the models the table already has and never " +
      "adds one, so give it a row in `.amy/model-specs.json`, or set the ceiling in tokens.",
  );
}

/** `\`opus-6\``, or a phrase for a rung that named no model to price. */
function named(model: string): string {
  return model ? `\`${model}\`` : "the harness default model, which has no id to price";
}
