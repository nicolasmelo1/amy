import { PullRequestView } from "../review.js";

export interface OpenPullRequestRequest {
  repo: string;
  branch: string;
  title: string;
  /** Empty by convention: the ticket is the description. */
  body: string;
}

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
