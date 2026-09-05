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
  reviews: readonly ReviewSubmission[];
  threads: readonly ReviewThread[];
  requestedReviewers: readonly string[];
}

export interface OpenPullRequestRequest {
  repo: string;
  branch: string;
  title: string;
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
}
