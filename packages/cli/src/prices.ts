import { CommandEnvironment, Contribution, runNamed } from "./plugin-commands.js";

/**
 * How old a price table may be before the machine refreshes it.
 *
 * A week: prices move when a provider ships a model, and a table that is a
 * month old prices today's work with last month's numbers without saying so.
 */
export const STALE_AFTER_DAYS = "7";

/**
 * Keeps the shared price table current, through the command that owns it.
 *
 * The host does not know what a model costs or where a price table lives; it
 * knows that an install whose agents are about to run should not price them
 * off a table from last month. A machine that mounted no relay has no such
 * command, and nothing is asked of it.
 */
export async function refreshPricesWhenStale(
  contributions: readonly Contribution[],
  env: CommandEnvironment,
): Promise<void> {
  const ownsTheTable = contributions.some((contribution) =>
    contribution.commands.some((command) => command.name === "models"),
  );
  if (!ownsTheTable) return;

  const before = process.exitCode;
  try {
    // The table is the machine's, not a profile's, and nobody is here to
    // answer a question: take the first mount in config order rather than
    // letting the interactive ambiguity refusal skip the refresh entirely.
    const owner = contributions.find((contribution) =>
      contribution.commands.some((command) => command.name === "models"),
    );
    await runNamed(
      contributions,
      ["models", "refresh"],
      [],
      { staleAfter: STALE_AFTER_DAYS },
      env,
      owner?.profiles[0]?.name,
    );
  } catch (error) {
    // Said, and never fatal: the move or the loop that asked for it already
    // succeeded, and the table is repaired next time.
    env.out.error(`the price table was left as it was: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = before;
}
