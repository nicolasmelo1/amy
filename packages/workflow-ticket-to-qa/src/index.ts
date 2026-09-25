export { pullRequestTitle } from "./ticket.js";
export type { Ticket } from "./ticket.js";

export type { Comment } from "@amykit/core";

export { TICKET_STATES, WAITING_STATES, isTerminal, isWaiting } from "./state.js";
export type { TicketState } from "./state.js";

export { attemptsIn, disagreements, judgedThreadIds, newRecord } from "./record.js";
export type { Escalation, TicketRecord } from "./record.js";
// The outcome contracts re-exported from the core: they moved there beside
// the ports that carry them, and every consumer of this package keeps
// compiling because the names are the same names.
export type { AttemptOutcome, ThreadVerdict, TriageOutcome } from "@amykit/core";

export { DEFAULT_POLICY } from "./observation.js";
export type { Observation, Policy } from "./observation.js";

export {
  automatedReviewerSawHead,
  hasReviewedHead,
  isAutomatedReviewer,
  unresolvedThreads,
} from "./review.js";

export { isConfirmedFor, isWorkday, leastLoadedReviewer } from "./roster.js";
export type { Roster, RosterMember } from "./roster.js";

export { act, advance, settled, wait } from "./effects.js";
export type { Effect } from "./effects.js";

export { applyOutcomes, applyTicketPlan, applyTransition } from "./outcomes.js";
export type { EffectOutcomes } from "./outcomes.js";

export { plan, ticketToQa } from "./machine.js";

export { ticketRuntime } from "./runtime.js";
export type { TicketRuntimeConfig, TicketRuntimeDeps } from "./runtime.js";

export { WORKFLOW_DATA, configSchema, plugin } from "./plugin.js";
export type { Provider } from "./plugin.js";

export type {
  FollowUpRequest,
  Tracker,
  TrackerReads,
  TrackerWrites,
  TrackerWriteCapability,
  Agent,
  Gate,
} from "@amykit/core";
