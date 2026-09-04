import { PullRequestView, ReviewThread } from "@amy/core";

/**
 * The automated reviewer answers to three different names depending on which
 * API you ask: `copilot-pull-request-reviewer[bot]` on REST reviews,
 * `Copilot` on REST review comments, and `copilot-pull-request-reviewer` on
 * GraphQL. Adapters normalise to one of these, and this is the only place
 * that decides what counts.
 */
const AUTOMATED_REVIEWER_LOGINS = [
  "copilot-pull-request-reviewer[bot]",
  "copilot-pull-request-reviewer",
  "copilot",
];

export function isAutomatedReviewer(author: string): boolean {
  return AUTOMATED_REVIEWER_LOGINS.includes(author.toLowerCase());
}

/** Threads that still need an answer, from either the bot or a human. */
export function unresolvedThreads(
  pr: PullRequestView,
  from: "automated" | "human",
): readonly ReviewThread[] {
  return pr.threads.filter((t) => {
    if (t.isResolved) return false;
    const automated = isAutomatedReviewer(t.author);
    return from === "automated" ? automated : !automated;
  });
}

/**
 * Whether the given author has reviewed the current head.
 *
 * This has to be asked per head rather than "has reviewed at all", because
 * the automated reviewer posts a COMMENTED review even when it has nothing
 * to say. Treating any review as a signal would let a push go out
 * unreviewed, and treating "no threads" as approval would skip the wait
 * entirely.
 */
export function hasReviewedHead(pr: PullRequestView, author: string): boolean {
  return pr.reviews.some(
    (r) => r.author.toLowerCase() === author.toLowerCase() && r.commitSha === pr.headSha,
  );
}

export function automatedReviewerSawHead(pr: PullRequestView): boolean {
  return pr.reviews.some((r) => isAutomatedReviewer(r.author) && r.commitSha === pr.headSha);
}
