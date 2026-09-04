/** A ticket identifier as the tracker and the PR title spell it, e.g. `PROJ-1239`. */
export type TicketId = string;

export interface Ticket {
  id: TicketId;
  title: string;
  team: string;
  url: string;

  /**
   * The branch name the tracker itself derived, e.g.
   * `ada/proj-1239-total-is-wrong-on-the-invoice-summary-and-the-list`.
   *
   * Never derive this locally. The tracker owns the slug, it truncates long
   * titles in its own way, and a branch that disagrees with it breaks the
   * tracker's automatic PR linking.
   */
  branchName: string;

  /**
   * The status *name*, not its category.
   *
   * Matching on the category would be wrong: the tracker files In Review,
   * In QA, Ready To Release and Triage Review under the same `started`
   * category as In Progress, so a category match picks up tickets that are
   * already past implementation.
   */
  status: string;

  /** Repository the work belongs to, as `owner/name`. */
  repo: string;
}

/** The title convention for a pull request opened for a ticket. */
export function pullRequestTitle(ticket: Ticket): string {
  return `${ticket.id}: ${ticket.title}`;
}
