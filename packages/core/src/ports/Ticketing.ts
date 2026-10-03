import { CORE_ACTIONS } from "../actions.js";

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
  /** The tracker's team, where it has one. Linear does; GitHub Issues does not. */
  team?: string;
  url: string;

  /**
   * The branch name the tracker itself derived, e.g.
   * `ada/proj-1239-total-is-wrong-on-the-invoice-summary-and-the-list`.
   *
   * Never derive this locally. The tracker owns the slug, it truncates long
   * titles in its own way, and a branch that disagrees with it breaks the
   * tracker's automatic PR linking. Absent where the tracker derives none,
   * and a workflow that needs one refuses the ticket by name.
   */
  branchName?: string;

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
 * Derived from `CORE_ACTIONS` at read time except where an action's handler
 * makes additional mutations beyond its dispatch method.
 */
export function trackerWritesFor(action: string): TrackerWriteCapability[] {
  // The hand-off handler changes both status and assignee. Its catalogue entry
  // names the dispatch method, while this table names every external mutation
  // the action performs so boot can reject an incomplete declaration.
  if (action === "hand-off-to-qa") return ["set-status", "assign"];
  const capability = TRACKER_WRITE_FOR_METHOD[CORE_ACTIONS[action]?.method ?? ""];
  return capability ? [capability] : [];
}

export function trackerWriteFor(action: string): TrackerWriteCapability | undefined {
  return trackerWritesFor(action)[0];
}

export const TRACKER_WRITE_FOR_METHOD: Readonly<Record<string, TrackerWriteCapability>> = {
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
    usesActions.some((action) => trackerWritesFor(action).includes(capability)),
  );
}