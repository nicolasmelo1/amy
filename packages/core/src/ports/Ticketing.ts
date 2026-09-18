import { AgentResult } from "../agent-run.js";
import { ReviewThread } from "./CodeHost.js";

/** What one read of a ticket concluded, for every workflow that reads one. */
export interface TriageOutcome {
  /** True when the ticket can be implemented as written. */
  clear: boolean;
  questions: string[];
  at: string;
  /**
   * The questions the machine asked on the ticket for this ticket to be
   * read again.
   *
   * Recorded beside the questions rather than re-derived from history, so a
   * second look can tell its own words from new information without reading
   * anything but the record and the conversation.
   */
  askedQuestions: string[];
}

/** What one attempt to write the change produced, gate included. */
export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent or the gate said, verbatim, for the next prompt. */
  output: string;
  at: string;
}

/** What one judged review comment concluded. */
export interface ThreadVerdict {
  threadId: string;
  /** `fixed` means the code changed. `disagreed` means it needs the owner. */
  verdict: "fixed" | "disagreed";
  note: string;
}

/**
 * The coding agent, and the only probabilistic thing in the system.
 *
 * Every method returns what it was asked for **and** an account of what the
 * run took: which harness, which model, how it ended, and what it spent.
 * Without that account there is nothing to escalate on and nothing to budget
 * against, so it is part of the contract rather than something bolted on.
 *
 * Lives here rather than in any one workflow because several workflows need
 * the same agent behind the same relay and the same ceiling, and a port that
 * lived in the first workflow would make the second a fork instead of a
 * package.
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

/**
 * The gate: the check that decides whether an implementation holds, before
 * anything is published for a person to read.
 *
 * Lives here for the same reason `Agent` does: the answer is a workflow's to
 * weigh, but what a gate *is* belongs below every workflow, so a second
 * workflow's own check slots into the same seam without restating it.
 */
export interface Gate {
  /**
   * Runs the gate against the ticket's own checkout, and says what happened.
   *
   * `ok` is the verdict; `output` is the evidence, verbatim, so a retry can
   * be handed the reason it is retrying rather than a summary of it.
   */
  run(ticket: Ticket): Promise<AttemptOutcome>;
}

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

/**
 * What a ticket is, carried to every step that reads one. The id is the
 * identifier the tracker and the PR title spell it, e.g. `PROJ-1239`.
 */
export interface Ticket {
  id: string;
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

  /**
   * The description the tracker fetched, when it fetched one.
   *
   * Absent stays absent: an empty description is a real state and not an
   * error, and a prompt that says so is what lets the agent ask for a body
   * rather than invent one.
   */
  body?: string;

  /**
   * What the team says this ticket *is*, as the tracker's own names.
   *
   * A label is how a team marks what a ticket is for — an epic labelled
   * `Feature` carries its sub-issues as the actual work — and it is the
   * tracker's fact rather than the caller's guess. Empty where the ticket
   * carries none, which is most of them and is a state, not an error.
   */
  labels: string[];

  /** Repository the work belongs to, as `owner/name`. */
  repo: string;

  /**
   * The brief this ticket's work belongs to, when a grooming workflow kept
   * one: its id, for the workflow's runtime to resolve against the mounted
   * brief store, and the rendered text beside it, so a step that never asks
   * the store still reads the current statement.
   *
   * The tracker's own facts — the parent, say — decide the id; nothing
   * derives it from the body. A ticket with no brief carries neither field,
   * and every prompt built from it is unchanged.
   */
  briefId?: string;
  /**
   * The current statement of the feature this ticket's work belongs to, when
   * a grooming workflow keeps one.
   *
   * A brief is the revisable artifact a group of sibling tickets implement;
   * the ticket's own body is fixed at grooming time and never answers a
   * question asked later. This is the *rendered current text* rather than a
   * pointer, so every step reads what a revision between ticks actually
   * said — but it is a snapshot from one observation, not a live view: a
   * step that needs it again re-observes, the way every other field here is
   * re-read rather than replayed from the record. A ticket with no brief
   * carries none, and every prompt built from one is unchanged.
   */
  brief?: string;
}

/** The title convention for a pull request opened for a ticket. */
export function pullRequestTitle(ticket: Ticket): string {
  return `${ticket.id}: ${ticket.title}`;
}

/** Reads a tracker answers, and writes only the workflow's declared surface. */
export interface TrackerReads {
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
}

/**
 * The writes a tracker answers — deliberately its own surface rather than
 * half of one contract.
 *
 * The read half is what discovery and observation need; this half is what
 * changes the outside world. A workflow that promised not to edit the
 * tracker receives only the read half, and a mount that hands a workflow a
 * mutator it never claimed is refused at boot — the refusal is the reason
 * the two halves are separate.
 */
export interface TrackerWrites {
  comment(ticketId: string, body: string): Promise<void>;

  setStatus(ticketId: string, statusName: string): Promise<void>;

  assign(ticketId: string, trackerIdentity: string): Promise<void>;

  createFollowUp(request: FollowUpRequest): Promise<string>;
}

/** The issue tracker that owns the ticket. */
export type Tracker = TrackerReads & TrackerWrites;

/**
 * A feature is a tracker-owned grouping of work, deliberately not a ticket
 * workflow's private parent convention. Any workflow may read it through the
 * same provider that supplies ticket work.
 */
export interface Feature {
  id: string;
  title: string;
  body?: string;
  repos: readonly string[];
}

/** Read-only feature discovery supplied by a tracker provider. */
export interface FeatureTracker {
  features(): Promise<Feature[]>;
  getFeature(id: string): Promise<Feature | null>;
}

/** Work created by a grooming run, with durable grooming provenance. */
export interface GroomedWork {
  id: string;
  featureId: string;
  /** Identifies the grooming workflow, not a brief membership. */
  groomedBy: string;
  title: string;
  body: string;
  retired: boolean;
}

/**
 * Tracker mutations a grooming workflow needs. They are feature-scoped rather
 * than ticket-workflow operations so a provider can implement them without
 * importing or knowing about ticket-to-qa.
 */
export interface FeatureWorkTracker {
  groomedWork(featureId: string, groomedBy: string): Promise<GroomedWork[]>;
  createGroomedWork(input: Omit<GroomedWork, "id" | "retired">): Promise<GroomedWork>;
  updateGroomedWork(id: string, input: Pick<GroomedWork, "title" | "body">): Promise<GroomedWork>;
  retireGroomedWork(id: string): Promise<void>;
}

/** Provider-neutral capability needed by a feature grooming workflow. */
export type GroomingTracker = FeatureTracker & FeatureWorkTracker;

/**
 * What one workflow declares about the writes it may make, named so a boot
 * refusal can quote it back.
 *
 * The core knows the names; a workflow's policy decides which to claim. A
 * mount refuses a workflow that declares a tracker-mutating action while
 * claiming none, naming the action and the capability before any tick.
 */
export const TRACKER_WRITE_CAPABILITIES = [
  "comment",
  "set-status",
  "assign",
  "create-follow-up",
] as const;

export type TrackerWriteCapability = (typeof TRACKER_WRITE_CAPABILITIES)[number];

/**
 * The tracker action a core action resolves to, so a mount can ask whether a
 * declared action mutates without learning what any action means.
 *
 * Derived from `CORE_ACTIONS` at read time rather than restated, so a new
 * tracker action added to the catalogue is covered by the same declaration
 * rule without anybody remembering to extend a second list.
 */
export function trackerWriteFor(action: string): TrackerWriteCapability | undefined {
  const method = CORE_ACTION_METHODS[action];
  return method === undefined ? undefined : METHOD_CAPABILITIES[method];
}

/**
 * The core action table, mirrored by name so this module does not import
 * the module that imports it. Kept in step by a test that derives both
 * sides from the artifacts and refuses a disagreement.
 */
const CORE_ACTION_METHODS: Readonly<Record<string, string>> = {
  "ask-question": "comment",
  escalate: "createFollowUp",
  "hand-off-to-qa": "setStatus",
};

const METHOD_CAPABILITIES: Readonly<Record<string, TrackerWriteCapability>> = {
  comment: "comment",
  createFollowUp: "create-follow-up",
  setStatus: "set-status",
  assign: "assign",
};

/**
 * What a workflow declares it may do to the tracker: every tracker-mutating
 * core action it uses, as capabilities, or nothing at all.
 *
 * Derived from the actions it declares rather than written by hand, so the
 * claim cannot drift from the table it is checked against.
 */
export function trackerCapabilitiesFor(usesActions: readonly string[]): TrackerWriteCapability[] {
  return TRACKER_WRITE_CAPABILITIES.filter((capability) =>
    usesActions.some((action) => trackerWriteFor(action) === capability),
  );
}