import { CORE_ACTIONS } from "../actions.js";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface ReviewSubmission {
  author: string;
  state: ReviewState;
  /** The head the review was submitted against, so a stale review is visible. */
  commitSha: string;
  submittedAt: string;
}

export interface ReviewThread {
  id: string;
  author: string;
  body: string;
  isResolved: boolean;
  isOutdated: boolean;
  /**
   * The conversation the thread carries, oldest first, opening comment included.
   *
   * `author` and `body` above stay the opening comment's, so a consumer that
   * asks what a thread is *about* keeps its answer whether or not it asked for
   * the conversation. What follows it is what decides whose turn it is —
   * `comments.at(-1)?.author` reads that off the view alone, with no second
   * call — and a correction written inside the thread reaches whoever is
   * handed the whole of it.
   */
  comments: readonly { author: string; body: string; createdAt: string }[];
}

/**
 * What the forge's own checks say. `none` where it runs none at all, which is
 * a different answer from "not passing" and the workflow has to tell them
 * apart: a repository with no CI must not wait forever for a verdict.
 */
export type ChecksState = "passing" | "failing" | "running" | "none";

export interface ChecksView {
  state: ChecksState;
  /**
   * The commit they ran against.
   *
   * Carried for the same reason a review carries one: a green rollup from
   * three pushes ago says nothing about the head, and a workflow that could
   * not tell would hand a broken branch to a person.
   */
  commitSha: string;
}

/**
 * What stands between the branch and its base, as the forge sees it.
 *
 * Only the states a workflow can act on itself, plus not-yet-known — the
 * forge works a merge out asynchronously, and `unknown` is the honest answer
 * while it does rather than a guess in either direction.
 *
 * Everything else a forge reports here — blocked on a required review,
 * unstable because checks are red — is already carried by `reviewDecision`
 * and `checks`. A second name for it would be two fields free to disagree.
 */
export type MergeState = "mergeable" | "conflicting" | "behind" | "unknown";

/** One pull request waiting on somebody's review. */
export interface ReviewRequest {
  repo: string;
  number: number;
  url: string;
  title: string;
  author: string;
  /** The head it is asking about, so a review of an older one is visible. */
  headSha: string;
}

export interface PullRequestView {
  number: number;
  /**
   * Where a person opens it.
   *
   * Carried rather than derived, because deriving it means a workflow
   * knowing which forge this is, and the forge is the one thing here that is
   * meant to be swappable. It is what makes an announcement something you can
   * act on from a phone instead of a number you have to go and look up.
   */
  url: string;
  headSha: string;
  isDraft: boolean;
  /**
   * How big the change is, so a workflow can decide before it spends an agent.
   *
   * Carried here rather than counted from a diff, because the forge already
   * knows and fetching the diff to find out costs the thing the number exists
   * to avoid. A workflow that refuses to hand a five-hundred-file pull request
   * to an agent needs this *before* the call, and every other way of getting
   * it is more expensive than the call it is trying to prevent.
   */
  changedFiles: number;
  additions: number;
  deletions: number;
  reviewDecision: ReviewDecision;
  /** What the forge's own checks say about the head, or null where it runs none. */
  checks: ChecksView | null;
  mergeState: MergeState;
  /**
   * Whether the forge has already merged it, and where it would land.
   *
   * The open-only filter belongs to the by-branch search, so a pull request
   * read by number is readable after the merge too — and what a merged one
   * was against is the fact a stack wants without a second call. Carried
   * from the same node the rest of the view is mapped from, so a caller
   * never asks twice for what arrived together.
   */
  merged: boolean;
  /** The branch it is aimed at, as the forge names it. */
  base: string;
  reviews: readonly ReviewSubmission[];
  threads: readonly ReviewThread[];
  requestedReviewers: readonly string[];
}

export interface OpenPullRequestRequest {
  repo: string;
  branch: string;
  title: string;
  /**
   * What the pull request is opened against.
   *
   * Absent means the forge's own default, which is the answer an install
   * that named no mapping has always meant. A repository whose base branch
   * is not the forge's default for it names its own here — the lookup is the
   * caller's, because the caller is the one that knows the repository.
   */
  base?: string;
  /**
   * Opened as a draft, which says "look at this when you want to".
   *
   * For work nobody asked for at the moment it lands — an errand — that is
   * the honest state to open in. Work somebody is waiting on is not a draft.
   */
  draft?: boolean;
  /**
   * What the pull request says for itself.
   *
   * Empty where something else is already the description — a ticket the
   * forge links back to — and written out where nothing else would say why
   * the change exists.
   */
  body: string;
}

/** The capability names a workflow may claim before it mutates the forge. */
export const CODE_HOST_WRITE_CAPABILITIES = [
  "open-pull-request",
  "request-review",
  "resolve-thread",
  "merge",
  "submit-review",
  "create-issue",
] as const;

export type CodeHostWriteCapability = (typeof CODE_HOST_WRITE_CAPABILITIES)[number];

/**
 * The forge: a repository, a branch, a pull request and a login.
 *
 * Not one method here mentions a ticket, a plan or anything else a workflow
 * might be about, which is why it lives in the core rather than in the first
 * workflow that happened to need it. Two workflows mount one adapter behind
 * it instead of one adapter each.
 */
export interface CodeHost {
  findPullRequest(repo: string, branch: string): Promise<PullRequestView | null>;

  openPullRequest(request: OpenPullRequestRequest): Promise<number>;

  requestReview(repo: string, pullRequestNumber: number, host: string): Promise<void>;

  /**
   * Closes one review thread, by its own id, in one act.
   *
   * The id is the one `findPullRequest` already carried on the thread, so a
   * caller never has to know which forge it is talking to — the same reason
   * the thread carries a `url` nobody derives.
   *
   * Settling a thread is the forge's word for "this is answered", and it is
   * the one act a state whose exit reads "no open thread" was missing: without
   * it, code that answers a review still leaves the conversation open for
   * somebody to close by hand.
   */
  resolveReviewThread(threadId: string): Promise<void>;

  /**
   * Puts a closed thread back, for a fix that was reverted.
   *
   * Mounted beside `resolveReviewThread` rather than invented for a day that
   * may never come, because the two are one capability — a forge either lets
   * this machine speak in a thread's lifecycle or it does not.
   */
  unresolveReviewThread(threadId: string): Promise<void>;

  /**
   * Open reviews per login, counted across every given repository.
   *
   * Counting one repository would send every review to whoever happens to be
   * quiet in that one.
   */
  reviewLoad(repos: readonly string[]): Promise<Record<string, number>>;

  /**
   * The open pull requests waiting on one login's review, in these
   * repositories and no others.
   *
   * Scoped to the list because a forge search is account-wide: asked without
   * it, this machine would pick up work from every repository its credential
   * can see, including ones nobody meant it to touch. `reviewLoad` answers
   * "how buried is each reviewer"; this answers "what is waiting on me", and
   * the second cannot be derived from the first — it counts, it does not say
   * which.
   */
  reviewsRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]>;

  /**
   * The open pull requests one login's review left changes requested on, in
   * these repositories and no others.
   *
   * The mirror of `reviewsRequestedOf`: that answers "what is waiting on
   * me", this answers "where did my review leave changes requested", and a
   * discovery by review state is the second of the two. Scoped for the same
   * account-wide reason, and returning views rather than a count for the
   * same reason — the caller filters by what the review state means, which
   * is policy, and the port only says what the forge reports.
   */
  changesRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]>;

  /**
   * One pull request by its number, merged or not.
   *
   * `findPullRequest` is a search, and a search is a filter: a review request
   * only ever knows a number, and a number can be a pull request that has
   * already landed — which is exactly when a stack still wants to read what
   * it sits on. The open-only filter belongs to the by-branch search, and
   * stays there.
   */
  pullRequest(repo: string, number: number): Promise<PullRequestView | null>;

  /**
   * Merges it, by the method the caller named.
   *
   * Which method a repository's ruleset allows is the caller's to decide —
   * that is policy, and it differs per repository and per team. The forge
   * only has to carry out what was asked and refuse honestly where it will
   * not: a refused merge comes back as a failed call, not as a quiet no-op.
   */
  merge(repo: string, number: number, method: "merge" | "squash" | "rebase"): Promise<void>;

  /**
   * Submits a review of it, in the state the caller decided on.
   *
   * The state is forge vocabulary — the same words every review in the view
   * is already carried as — and whether to submit one at all is the
   * workflow's, which is the same split that leaves thread-closing policy
   * in the workflow while the port makes it possible.
   */
  submitReview(
    repo: string,
    number: number,
    review: { state: ReviewState; body: string },
  ): Promise<void>;

  /**
   * Files an issue in the repository, as the forge writes one.
   *
   * A tracker port is a ticket somebody is driving; this is the repository's
   * own defect list, and a workflow that reports a finding to the forge
   * should not need a second key or a second client to say it.
   */
  createIssue(repo: string, issue: { title: string; body: string }): Promise<number>;

  /**
   * The statuses the forge recorded on one commit, as a list.
   *
   * A freeze is one reader's conclusion over this list — which names which
   * statuses count and which are noise — and the list is the port's
   * contribution. Reading it here, rather than beside the plugin, is what
   * keeps the second reader from shelling out on its own.
   */
  commitStatuses(repo: string, sha: string): Promise<
    { context: string; state: "passing" | "failing" | "running" }[]
  >;
}

/** The declaration capability for each mutating forge method. */
export const CODE_HOST_WRITE_FOR_METHOD: Readonly<Record<string, CodeHostWriteCapability>> = {
  openPullRequest: "open-pull-request",
  requestReview: "request-review",
  resolveReviewThread: "resolve-thread",
  unresolveReviewThread: "resolve-thread",
  merge: "merge",
  submitReview: "submit-review",
  createIssue: "create-issue",
};

/** The declaration capability an action needs when it dispatches to the forge. */
export function codeHostWriteFor(action: string): CodeHostWriteCapability | undefined {
  return CODE_HOST_WRITE_FOR_METHOD[CORE_ACTIONS[action]?.method ?? ""];
}
