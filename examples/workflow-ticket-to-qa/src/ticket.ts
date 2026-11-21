export type { Ticket } from "@amykit/core";
import type { Ticket } from "@amykit/core";

/**
 * This workflow's title for the pull request it opens: `ID: title`.
 *
 * The workflow's rather than the core's, because how a title reads is a
 * team's convention and the errand titles its own differently.
 */
export function pullRequestTitle(ticket: Ticket): string {
  return `${ticket.id}: ${ticket.title}`;
}

/** One ticket id, the way a tracker writes one: letters, digits, a hyphen and a number. */
const TICKET_ID = /^[A-Z][A-Z0-9]*-\d+$/;

/** Whether a value is a ticket id rather than prose that was meant to name one. */
export function isTicketId(value: unknown): value is string {
  return typeof value === "string" && TICKET_ID.test(value);
}

const STACK_BASE = /^[>\s*-]*Stack base\s*:\s*(.+)$/i;

/**
 * The parents a ticket's description says it stacks on.
 *
 * A ticket states its base in a line of its own, `Stack base: PROJ-1000`, for
 * people who write it where they say what the work is. Written twice it is
 * two answers, which the ticket refuses rather than guessing between.
 */
export function stackBasesIn(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .split("\n")
    .flatMap((line) => {
      const found = STACK_BASE.exec(line);
      return found ? [found[1]!.trim()] : [];
    })
    .filter((id) => id.length > 0);
}
