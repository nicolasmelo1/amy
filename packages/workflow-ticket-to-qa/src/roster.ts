import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

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

/** The roster this workflow keeps, at the root of the profile that mounts it. */
export const ROSTER_FILE = "roster.yaml";

export function rosterPath(state: string): string {
  return path.join(state, ROSTER_FILE);
}

/**
 * Who is reviewing today, read off this profile's own file.
 *
 * A file rather than a setting: it changes daily and confirming it is one
 * command, and two ticket-to-qa profiles belong to two teams who do not share
 * reviewers.
 */
export function loadRoster(state: string): Roster {
  const file = rosterPath(state);
  if (!fs.existsSync(file)) {
    throw new Error(`no roster at ${file}; write one with amy init, or run \`amy roster confirm\` once it is there`);
  }

  const parsed = YAML.parse(fs.readFileSync(file, "utf-8")) as Partial<Roster> | null;

  if (!parsed?.confirmedOn || !parsed.reviewers?.length || !parsed.qa) {
    throw new Error(`${file} needs confirmedOn, reviewers and qa`);
  }

  return parsed as Roster;
}

/**
 * Stamps the roster with today's date.
 *
 * Deliberately a separate action from editing it, so confirming that nothing
 * changed is one command rather than a file edit somebody skips.
 */
export function confirmRoster(state: string, today: Date): Roster {
  const roster = loadRoster(state);
  const confirmed: Roster = { ...roster, confirmedOn: today.toISOString().slice(0, 10) };
  fs.writeFileSync(rosterPath(state), YAML.stringify(confirmed), "utf-8");
  return confirmed;
}

/** What a profile that mounts this workflow is given, once, by `amy init`. */
export const EXAMPLE_ROSTER = `# Who is reviewing today, and who owns QA.
#
# confirmedOn is checked against today's date on every workday. The machine
# refuses to assign anybody while it is stale, because people go on leave
# without editing a file and a review assigned to someone who is away stalls
# for days without anything looking broken.
#
# Confirm it with: amy roster confirm
confirmedOn: "1970-01-01"

reviewers:
  - tracker: ada@example.test
    host: ada
    available: true
  - tracker: alan@example.test
    host: alan
    available: true
  - tracker: edsger@example.test
    host: edsger
    available: true

qa:
  tracker: grace@example.test
  host: grace
  available: true
`;

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
