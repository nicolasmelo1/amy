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
}

export interface PullRequestView {
  number: number;
  headSha: string;
  isDraft: boolean;
  reviewDecision: ReviewDecision;
  reviews: readonly ReviewSubmission[];
  threads: readonly ReviewThread[];
  requestedReviewers: readonly string[];
}

export interface OpenPullRequestRequest {
  repo: string;
  branch: string;
  title: string;
  /**
   * What the pull request says for itself.
   *
   * Empty where something else is already the description — a ticket the
   * forge links back to — and written out where nothing else would say why
   * the change exists.
   */
  body: string;
}

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
   * Open reviews per login, counted across every given repository.
   *
   * Counting one repository would send every review to whoever happens to be
   * quiet in that one.
   */
  reviewLoad(repos: readonly string[]): Promise<Record<string, number>>;
}
