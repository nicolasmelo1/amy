import { AgentResult, ReviewThread } from "@amykit/core";
import { AttemptOutcome, ThreadVerdict, TriageOutcome } from "../record.js";
import { Ticket } from "../ticket.js";

/**
 * The coding agent, and the only probabilistic thing in the system.
 *
 * Every method returns what it was asked for **and** an account of what the
 * run took: which harness, which model, how it ended, and what it spent.
 * Without that account there is nothing to escalate on and nothing to budget
 * against, so it is part of the contract rather than something bolted on.
 */
export interface Agent {
  /**
   * Reads the ticket and says whether it can be implemented as written.
   *
   * `conversation` carries what the ticket's comments said, already split by
   * who wrote it — an answer to an earlier question is part of the ticket,
   * and a prompt that leaves it out asks the same question twice.
   */
  triage(ticket: Ticket, conversation?: readonly string[]): Promise<AgentResult<TriageOutcome>>;

  /**
   * Writes the change, or the next attempt after one that did not hold.
   *
   * `conversation` is here for the same reason: a first attempt that worked
   * from an answer the ticket never showed is an attempt nobody can audit.
   */
  implement(
    ticket: Ticket,
    retryContext?: string,
    conversation?: readonly string[],
  ): Promise<AgentResult<AttemptOutcome>>;

  /**
   * Judges review comments one by one. A comment it agrees with is fixed, a
   * comment it disagrees with comes back as a disagreement for the owner
   * rather than being argued with on the pull request.
   */
  addressThreads(
    ticket: Ticket,
    threads: readonly ReviewThread[],
    from: "automated" | "human",
  ): Promise<AgentResult<ThreadVerdict[]>>;
}
