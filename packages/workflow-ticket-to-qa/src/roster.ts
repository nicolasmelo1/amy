export interface RosterMember {
  /** How the tracker identifies them, normally an email. */
  tracker: string;
  /** How the code host identifies them, a login. */
  host: string;
  /** Cleared when someone is on leave. */
  available: boolean;
}

export interface Roster {
  /**
   * The date the roster was last confirmed, as `YYYY-MM-DD`.
   *
   * The machine refuses to assign anybody on a workday when this is not
   * today. People go on leave without updating a config file, and assigning
   * a reviewer who is away stalls a pull request for days without anything
   * looking broken.
   */
  confirmedOn: string;
  reviewers: RosterMember[];
  qa: RosterMember;
}

/** Monday through Friday. Saturday is 6 and Sunday is 0. */
export function isWorkday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

export function isConfirmedFor(roster: Roster, now: Date): boolean {
  if (!isWorkday(now)) {
    return true;
  }
  return roster.confirmedOn === now.toISOString().slice(0, 10);
}

/**
 * The available reviewer carrying the fewest open reviews.
 *
 * Ties break on the host login so the same inputs always pick the same
 * person, which keeps a dry run comparable to the run that follows it.
 */
export function leastLoadedReviewer(
  roster: Roster,
  load: Readonly<Record<string, number>>,
  exclude: readonly string[] = [],
): RosterMember | null {
  const candidates = roster.reviewers
    .filter((r) => r.available)
    .filter((r) => !exclude.includes(r.host))
    .sort((a, b) => {
      const byLoad = (load[a.host] ?? 0) - (load[b.host] ?? 0);
      return byLoad !== 0 ? byLoad : a.host.localeCompare(b.host);
    });

  return candidates[0] ?? null;
}
