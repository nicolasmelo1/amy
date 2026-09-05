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
  /** Reads the ticket and says whether it can be implemented as written. */
  triage(ticket: Ticket): Promise<AgentResult<TriageOutcome>>;

  implement(ticket: Ticket, retryContext?: string): Promise<AgentResult<AttemptOutcome>>;

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
