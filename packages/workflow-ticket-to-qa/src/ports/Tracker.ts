import { Ticket } from "../ticket.js";

/**
 * One comment on a ticket, as the tracker holds it.
 *
 * `fromAmy` is the tracker's answer, not a guess by whatever reads the
 * conversation: amy authenticates with a key issued to a person, so *which*
 * account wrote a comment is a fact only the tracker knows.
 */
export interface Comment {
  /** Who wrote it, as the tracker names them. */
  author: string;
  body: string;
  /** When it was written, as an ISO instant. */
  at: string;
  /** Whether the machine's own account wrote it. */
  fromAmy: boolean;
}

export interface FollowUpRequest {
  parentTicketId: string;
  title: string;
  body: string;
}

/** The issue tracker that owns the ticket. */
export interface Tracker {
  /**
   * Tickets assigned to the operator that sit in the working status.
   *
   * Implementations must match the status by *name*. The tracker files
   * In Review, In QA and Ready To Release under the same category as
   * In Progress, so a category match returns work that is already past
   * implementation.
   */
  inProgress(): Promise<Ticket[]>;

  /** One ticket by id, including after it has left the working status. */
  get(ticketId: string): Promise<Ticket | null>;

  comment(ticketId: string, body: string): Promise<void>;

  /**
   * The conversation on a ticket, oldest first, up to now.
   *
   * `since` is the instant to read from — a waiting state asks for what
   * arrived after its question, and a prompt rebuild asks for the whole
   * thread. Returning the text is the point: `hasReplyAfter` answers
   * *whether* the ticket was answered, and an answer a caller cannot read is
   * the defect this method exists to close.
   */
  comments(ticketId: string, since?: string): Promise<Comment[]>;

  /** Whether anybody other than the machine has replied since the given instant. */
  hasReplyAfter(ticketId: string, since: string): Promise<boolean>;

  setStatus(ticketId: string, statusName: string): Promise<void>;

  assign(ticketId: string, trackerIdentity: string): Promise<void>;

  createFollowUp(request: FollowUpRequest): Promise<string>;
}
