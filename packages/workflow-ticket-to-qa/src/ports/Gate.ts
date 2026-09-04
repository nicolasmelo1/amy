import { AttemptOutcome } from "../record.js";
import { Ticket } from "../ticket.js";

/**
 * The deterministic check that decides whether an implementation holds.
 *
 * Its output is kept verbatim, because it becomes the agent's retry context.
 */
export interface Gate {
  run(ticket: Ticket): Promise<AttemptOutcome>;
}
