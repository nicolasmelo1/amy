/**
 * One brief: the current statement of the feature a group of work items
 * implements, owned by the workflow that grooms and everything a later
 * ticket step reads.
 *
 * A brief is opaque content with explicit work membership. It does not model
 * acceptance criteria, sources or answers — a workflow decides its own
 * sections and what counts as a source, and the core never parses either.
 * What the core guarantees is narrower and load-bearing: a stable id, a
 * revision that changes when the text does, the work ids it explains, and a
 * read that returns the current version rather than a copy folded into a
 * ticket record.
 */

/** The stable id of a brief, as `amy brief show` and a workflow name it. */
export type BriefId = string;

/** One question a later step appended, carried with its provenance. */
export interface BriefQuestion {
  /** The work id the question is about, which is also who must answer. */
  workId: string;
  /** The question itself, in the asking step's own words. */
  question: string;
  /** When it was asked, as an ISO instant. */
  at: string;
}

/**
 * The current brief as a step reads it: the rendered document and what it
 * took to be current, never a copy stashed at grooming time.
 */
export interface BriefView {
  /** The rendered document, sections and questions in order. */
  text: string;
  /** How many revisions the brief has had, starting at one. */
  revision: number;
}

/** A stored brief, as the persistence port reads it back. */
export interface BriefRecord {
  id: BriefId;
  /** The workflow's declared sections, in the order it declared them. */
  sections: { name: string; body: string }[];
  /** Questions appended by later work, oldest first. */
  questions: BriefQuestion[];
  /** The work ids this brief explains, in the caller's own vocabulary. */
  explains: string[];
  /** When the brief was created, as an ISO instant. */
  createdAt: string;
  /** When the content last changed, as an ISO instant. */
  updatedAt: string;
  /**
   * How many revisions the brief has had, starting at one. Two reads with
   * the same revision carry the same text, so a step that saw revision N
   * and sees N again knows nothing was answered in between.
   */
  revision: number;
}

/**
 * The mounted persistence port behind every brief read and write.
 *
 * The file-backed adapter owns the on-disk layout and the atomic
 * replace/append; this is the seam so a second store can mount without any
 * workflow learning where the first keeps its files. Reads return the
 * current version each time rather than a copy folded into a ticket record,
 * so a revision between ticks cannot be hidden by old state.
 */
export interface BriefStore {
  /** The current brief by id, or null when no such brief exists. */
  get(id: BriefId): Promise<BriefRecord | null>;

  /**
   * Creates a brief, or replaces every section of an existing one. The id
   * is the caller's to choose and stable for the brief's life; an append is
   * a separate operation, so a revision never loses a question.
   */
  write(input: {
    id: BriefId;
    sections: { name: string; body: string }[];
    /** The work ids this brief explains, in the caller's own vocabulary. */
    explains: string[];
    at: string;
  }): Promise<BriefRecord>;

  /**
   * Appends a question, with its work id and time. There is no operation
   * that appends an answer: a question is decided by the workflow that owns
   * the brief, and that decision is a revision, not an append.
   */
  appendQuestion(input: { id: BriefId; question: BriefQuestion; at: string }): Promise<BriefRecord>;

  /**
   * Lists brief ids whose every work id is terminal and older than the
   * store's retention policy, for the retirement sweep. The caller decides
   * what terminal means in its own vocabulary; this only reports what it
   * was told at write time and cannot invent a work state it never knew.
   */
  retired(explainsAreTerminal: (workId: string) => boolean, retentionCutoffMs: number, now: Date): Promise<BriefId[]>;

  /** Removes a brief by id. The event log remains the durable history. */
  remove(id: BriefId): Promise<void>;
}

/**
 * Renders the current brief as a step reads it: sections in the order the
 * workflow declared them, then the questions later work raised.
 *
 * The renderer lives here because every consumer renders the same document
 * the same way — a brief a workflow reads differently than a person does is
 * two briefs — and because a workflow configures sections, not layout.
 */
export function renderBrief(brief: BriefRecord): BriefView {
  const text = [
    ...brief.sections.map((section) => `${section.name}\n${section.body}`),
    ...brief.questions.map(
      (question) =>
        `Question (from ${question.workId}, ${question.at}): ${question.question}`,
    ),
  ].join("\n\n");

  return { text, revision: brief.revision };
}