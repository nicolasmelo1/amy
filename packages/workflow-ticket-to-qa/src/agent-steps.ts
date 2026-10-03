import { ReviewThread, Ticket } from "@amykit/core";

/**
 * This workflow's steps, written on the agent's one method.
 *
 * The prompts, the answers' shapes and how they are read used to be the
 * agent port's own methods, which put this workflow's lifecycle into every
 * workflow's contract. They are this workflow's, exported for another
 * workflow that wants the same steps. See docs/design/an-agent-only-answers.md.
 */

/** What one read of a ticket concluded. */
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

/** What one judged review comment concluded. */
export interface ThreadVerdict {
  threadId: string;
  /** `fixed` means the code changed. `disagreed` means it needs the owner. */
  verdict: "fixed" | "disagreed";
  note: string;
}

/** Guidance appended when answering a particular reviewer, by host login. */
export type ReviewerHints = Readonly<Record<string, string>>;

/**
 * The branch the tracker derived for a ticket, or a refusal naming the field.
 *
 * This workflow opens the branch the tracker named, because the tracker links
 * the pull request by it. A tracker that derives none cannot drive this
 * workflow, and saying so beats inventing a branch the tracker will not link.
 */
export function branchOf(ticket: Ticket): string {
  if (ticket.branchName) return ticket.branchName;
  throw new Error(
    `${ticket.id} has no \`branchName\`: ticket-to-qa works on the branch its tracker derives, and this tracker derived none`,
  );
}

export function triagePrompt(ticket: Ticket, conversation?: readonly string[]): string {
  return [
    `You are deciding whether a ticket can be implemented as written.`,
    ``,
    `Ticket ${ticket.id}: ${ticket.title}`,
    `Tracker: ${ticket.url}`,
    ...briefLines(ticket),
    ...bodyLines(ticket),
    ...labelLines(ticket),
    ...conversationLines(conversation),
    `Read enough of this repository to judge it. Answer with a`,
    `single JSON object and nothing else:`,
    ``,
    `{"clear": true}`,
    ``,
    `if you could start implementing right now, or:`,
    ``,
    `{"clear": false, "questions": ["...", "..."]}`,
    ``,
    `listing only questions that genuinely block the work. A question you`,
    `could answer yourself by reading the code is not a blocking question.`,
    `A question already answered in the conversation above is not a`,
    `question: an answer to an earlier question is part of the ticket.`,
  ].join("\n");
}

/** Reads a triage answer; the questions asked are recorded so they are never asked twice. */
export function readTriage(answer: unknown, at: string): TriageOutcome {
  const reply = answer as { clear: boolean; questions?: string[] };
  const questions = reply.clear ? [] : (reply.questions ?? []);
  return { clear: reply.clear, questions, askedQuestions: questions, at };
}

/** A triage that could not be read: not clear, and nothing to ask. */
export function unreadTriage(at: string): TriageOutcome {
  return { clear: false, questions: [], askedQuestions: [], at };
}

export function implementPrompt(ticket: Ticket, retryContext?: string, conversation?: readonly string[]): string {
  return [
    `Implement this ticket in the current repository.`,
    ``,
    `Ticket ${ticket.id}: ${ticket.title}`,
    `Tracker: ${ticket.url}`,
    ...briefLines(ticket),
    ...bodyLines(ticket),
    ...labelLines(ticket),
    ...conversationLines(conversation),
    ...(retryContext
      ? [
          ``,
          `A previous attempt did not hold. This is what went wrong, verbatim:`,
          ``,
          retryContext,
          ``,
          `Fix the underlying cause. Do not discard work that was already correct.`,
        ]
      : []),
    ``,
    `Follow the conventions already in this repository. Do not commit: that is`,
    `handled for you.`,
  ].join("\n");
}

export function threadPrompt(
  ticket: Ticket,
  threads: readonly ReviewThread[],
  from: "automated" | "human",
  reviewerHints: ReviewerHints = {},
): string {
  const hints = [
    ...new Set(
      threads
        .map((thread) => reviewerHints[thread.author.toLowerCase()])
        .filter((hint): hint is string => Boolean(hint)),
    ),
  ];

  return [
    from === "automated"
      ? `An automated reviewer left comments on the pull request for this ticket.`
      : `A human reviewer left comments on the pull request for this ticket.`,
    ``,
    `Ticket ${ticket.id}: ${ticket.title}`,
    ...briefLines(ticket),
    ...bodyLines(ticket),
    ...labelLines(ticket),
    `Comments:`,
    ...threads.flatMap((thread) => [
      `\n[${thread.id}] ${thread.author} said:\n${thread.body}`,
      // A review is a conversation, not one comment: what follows the
      // opening comment is a correction of it or an answer to it. The first
      // comment is the header above, so the bullets carry only what came
      // after it, oldest first — the last one says who is being waited on.
      ...thread.comments.slice(1).map((comment) => `  - ${comment.author} replied:\n${comment.body}`),
    ]),
    ...(hints.length ? [``, `Reviewer notes:`, ...hints.map((hint) => `- ${hint}`)] : []),
    ``,
    `A later comment in a thread answers the earlier ones, and the last`,
    `comment says who the thread is waiting on. Answer the thread as it`,
    `stands now, not as its first comment left it.`,
    ``,
    `For each comment, either change the code or say why you disagree. Do not`,
    `argue on the pull request. Do not commit: that is handled for you.`,
    ``,
    `Then answer with a single JSON object and nothing else:`,
    ``,
    `{"verdicts": [{"threadId": "...", "verdict": "fixed", "note": "what you changed"}]}`,
    ``,
    `Use "disagreed" only when you did not change the code, and say why in the`,
    `note. A disagreement goes to the ticket owner to settle, so be specific.`,
  ].join("\n");
}

/**
 * Reads the verdicts, one per thread asked about.
 *
 * A comment the agent did not answer is not silently dropped. It goes to the
 * owner, because an unanswered review comment is the one thing that must
 * never disappear.
 */
export function readVerdicts(answer: unknown, threads: readonly ReviewThread[]): ThreadVerdict[] {
  const given = (answer as { verdicts?: ThreadVerdict[] }).verdicts ?? [];
  return threads.map((thread) => {
    const verdict = given.find((v) => v.threadId === thread.id);
    return {
      threadId: thread.id,
      verdict: verdict?.verdict ?? "disagreed",
      note: verdict?.note ?? "the agent did not answer this comment",
    };
  });
}

/**
 * The current brief the ticket's work belongs to, when it has one.
 *
 * Rendered rather than referenced: what a step must judge is what the brief
 * says *now*. A ticket with no brief carries none, and the prompt is
 * unchanged.
 */
function briefLines(ticket: Ticket): string[] {
  if (!ticket.brief) return [];
  return [
    `The current brief for the feature this ticket belongs to:`,
    ``,
    ticket.brief,
    ``,
    `Answer for the brief as it stands above, not for what the ticket`,
    `title alone says.`,
  ];
}

/** A ticket with no body says so, so the agent asks for one rather than guessing. */
function bodyLines(ticket: Ticket): string[] {
  return [``, ticket.body ?? `(this ticket has no description)`];
}

/** What the team says the ticket *is*; most carry no label and say nothing. */
function labelLines(ticket: Ticket): string[] {
  if (ticket.labels.length === 0) return [];
  return [`Labels: ${ticket.labels.join(", ")}`];
}

/** The conversation so far, so a question already answered is not asked again. */
function conversationLines(conversation?: readonly string[]): string[] {
  if (!conversation || conversation.length === 0) return [];
  return [``, `The conversation on the ticket, so far:`, ...conversation.map((line) => `- ${line}`)];
}
