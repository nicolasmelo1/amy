import { PullRequestView } from "@amykit/core";
import { Roster } from "./roster.js";
import { Ticket } from "./ticket.js";

/**
 * A snapshot of the outside world for one ticket, gathered before deciding.
 *
 * The decision function reads nothing else, so a test can put the machine in
 * any situation by building one of these.
 */
export interface Observation {
  ticket: Ticket;
  /** Null until a pull request exists for the ticket's branch. */
  pullRequest: PullRequestView | null;
  /**
   * Open reviews per host login, counted across every repository the team
   * uses. Counting one repository would send every review to whoever happens
   * to be quiet in that one.
   */
  reviewLoad: Readonly<Record<string, number>>;
  roster: Roster;
  /** Whether the blocking question posted on the ticket has been answered. */
  questionAnswered: boolean;
  /** Whether the owner has answered an escalation. */
  escalationAnswered: boolean;
  now: Date;
}

export interface Policy {
  maxImplementAttempts: number;
  maxGateAttempts: number;
  /** How long to hold in a waiting state before looking again. */
  pollBackoffMs: number;
  /** How long to hold while the roster needs confirming. */
  rosterBackoffMs: number;
  /**
   * How many open reviews one person may be carrying before this machine
   * stops adding to their pile. Review time is somebody else's, and it is
   * the one currency here that cannot be topped up.
   */
  maxOpenReviewsPerReviewer: number;
}

export const DEFAULT_POLICY: Policy = {
  maxImplementAttempts: 3,
  maxGateAttempts: 3,
  pollBackoffMs: 5 * 60 * 1000,
  rosterBackoffMs: 30 * 60 * 1000,
  maxOpenReviewsPerReviewer: 2,
};
