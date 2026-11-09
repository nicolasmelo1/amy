import { PullRequestView } from "@amykit/core";
import { Comment, ReplyKind } from "@amykit/core";
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
  /**
   * The conversation on the ticket, oldest first, in full.
   *
   * Fetched where it is used — a poll that is only waiting for a review does
   * not pay for text — and carried whole rather than reduced to a boolean, so
   * the state that re-reads the ticket can put the answer in front of the
   * agent instead of merely knowing one arrived.
   */
  conversation: Said[];
  /**
   * Whether the owner has decided an escalation: a reply that reads as a
   * decision under the policy, not merely any reply.
   */
  escalationAnswered: boolean;
  /**
   * Whether this work item's repository has left the ticket — a label taken
   * off, or a ticket that grew labels none of which is the repository its
   * work started in. Discovery no longer offers it, so the item is retired
   * rather than left to hand the ticket over beside the ones that remain.
   */
  retired?: boolean;
  /**
   * Whether the ticket already sits in the QA status, as the tracker reports
   * it. Read so a QA handoff the operator made by hand is something the
   * machine can see; absent is no.
   */
  inQa?: boolean;
  /**
   * For a ticket in more than one repository, each one and whether its pull
   * request has merged, in the tracker's order. Read only at the QA handoff,
   * which is the one state that joins them; absent everywhere else.
   */
  repositories?: readonly { repo: string; merged: boolean }[];
  now: Date;
}

/**
 * One thing said back, and what it is when the medium let the person say.
 * Unmarked is the common case, and `policy.conversation` reads it.
 */
export type Said = Comment & { kind?: ReplyKind };

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
  /**
   * How large a pull request may get before this machine stops handing it to
   * an agent, in files and in changed lines.
   *
   * Asked of a number the forge already knew, before any call, because the
   * whole point of a ceiling on cost is that reaching it costs nothing. A
   * five-hundred-file review is where an agent is least likely to help and
   * most likely to be expensive about it, and the honest move there is to
   * hand it back rather than to try three times.
   *
   * Zero switches the ceiling off, for somebody who would rather it always
   * tried.
   */
  maxPullRequestFiles: number;
  maxPullRequestLines: number;
  /**
   * Who makes the tracker and code-host writes: this machine, or the
   * operator. With `operator`, every write is said once instead of made, and
   * the machine waits until it sees the effect.
   */
  writes: "machine" | "operator";
  /**
   * How a reply nobody marked reads in a waiting state. `answer` takes it as
   * the decision, which is how this machine always read one; `discuss` takes
   * it as a turn in a discussion, answered in the thread while the work
   * waits for a reply marked as the decision. A marked reply reads as marked
   * under either.
   */
  conversation: "answer" | "discuss";
}

export const DEFAULT_POLICY: Policy = {
  maxImplementAttempts: 3,
  maxGateAttempts: 3,
  pollBackoffMs: 5 * 60 * 1000,
  rosterBackoffMs: 30 * 60 * 1000,
  maxOpenReviewsPerReviewer: 2,
  maxPullRequestFiles: 60,
  maxPullRequestLines: 2000,
  writes: "machine",
  conversation: "answer",
};
