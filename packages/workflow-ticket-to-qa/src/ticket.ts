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
