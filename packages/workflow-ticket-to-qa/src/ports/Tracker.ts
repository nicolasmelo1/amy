import { Ticket } from "../ticket.js";

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

  /** Whether anybody other than the machine has replied since the given instant. */
  hasReplyAfter(ticketId: string, since: string): Promise<boolean>;

  setStatus(ticketId: string, statusName: string): Promise<void>;

  assign(ticketId: string, trackerIdentity: string): Promise<void>;

  createFollowUp(request: FollowUpRequest): Promise<string>;
}
