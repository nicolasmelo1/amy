import { Rung } from "@amykit/agent-kit";
import { BUDGET_WINDOWS, ceilingFor, parseBudget } from "@amykit/core";
import { SpecTable, aliasFor, specFor } from "@amykit/model-specs";
import { ChatParts } from "./assemble.js";

/**
 * The chat's harnesses a dollar ceiling can hold, under chat.budget.
 *
 * The relay refuses a costUsd ceiling over a ladder it cannot price, but
 * `/harness` chooses among every contributed harness, not the relay's
 * ladders. A chat turn on an unpriced one would be recorded with no cost and
 * never move the ceiling it is charged to, so the chat does not offer it.
 * A ceiling in tokens needs no price, and leaves every harness offered.
 */
export function pricedForTheCeiling(parts: ChatParts, budget: unknown, table: SpecTable): { parts: ChatParts; unpriced: readonly string[] } {
  const parsed = parseBudget(budget);
  if (!parsed.ok) return { parts, unpriced: [] };
  const capsMoney = BUDGET_WINDOWS.some((window) => ceilingFor(parsed.limits, window.name)?.costUsd !== undefined);
  if (!capsMoney) return { parts, unpriced: [] };
  const unpriced = [...parts.rungs].filter(([, rung]) => !priced(rung, table)).map(([name]) => name);
  if (unpriced.length === 0) return { parts, unpriced };
  const keep = <T>(map: ReadonlyMap<string, T>) => new Map([...map].filter(([name]) => !unpriced.includes(name)));
  return { parts: { ...parts, harnesses: keep(parts.harnesses), rungs: keep(parts.rungs) }, unpriced };
}

/** Whether a rung's runs arrive with a cost: it prices its own, or the table has its model. */
function priced(rung: Rung, table: SpecTable): boolean {
  return rung.pricesItsOwnRuns === true || specFor(aliasFor(rung.model, table), table) !== undefined;
}
