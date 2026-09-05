import {
  ChecksView,
  CodeHost,
  CommandRunner,
  MergeState,
  OpenPullRequestRequest,
  PullRequestView,
  ReviewDecision,
  ReviewRequest,
  ReviewState,
  ReviewSubmission,
  ReviewThread,
} from "@amykit/core";

const PULL_REQUEST_QUERY = `
query PullRequest($owner: String!, $name: String!, $branch: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(headRefName: $branch, states: [OPEN], first: 1) {
      nodes {
        number
        url
        isDraft
        reviewDecision
        headRefOid
        changedFiles
        additions
        deletions
        mergeable
        mergeStateStatus
        commits(last: 1) {
          nodes { commit { oid statusCheckRollup { state } } }
        }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login }
              ... on Bot { login }
              ... on Team { slug }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            author { login }
            state
            submittedAt
            commit { oid }
          }
        }
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 1) { nodes { author { login } body } }
          }
        }
      }
    }
  }
}`;

const REVIEW_REQUESTS_QUERY = `
query ReviewRequests($query: String!) {
  search(query: $query, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number
        title
        url
        headRefOid
        author { login }
        repository { nameWithOwner }
      }
    }
  }
}`;

interface RawReviewRequest {
  number?: number;
  title?: string;
  url?: string;
  headRefOid?: string;
  author?: { login: string } | null;
  repository?: { nameWithOwner: string };
}

interface RawPullRequest {
  number: number;
  url: string;
  isDraft: boolean;
  reviewDecision: string | null;
  headRefOid: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  mergeable: string | null;
  mergeStateStatus: string | null;
  commits?: {
    nodes: { commit: { oid: string; statusCheckRollup: { state: string } | null } }[];
  };
  reviewRequests: {
    nodes: { requestedReviewer: { login?: string; slug?: string } | null }[];
  };
  reviews: {
    nodes: {
      author: { login: string } | null;
      state: string;
      submittedAt: string | null;
      commit: { oid: string } | null;
    }[];
  };
  reviewThreads: {
    nodes: {
      id: string;
      isResolved: boolean;
      isOutdated: boolean;
      comments: { nodes: { author: { login: string } | null; body: string }[] };
    }[];
  };
}

export class GitHubCodeHost implements CodeHost {
  constructor(private readonly runner: CommandRunner) {}

  async findPullRequest(repo: string, branch: string): Promise<PullRequestView | null> {
    const { owner, name } = split(repo);

    const raw = await this.graphql<{
      repository: { pullRequests: { nodes: RawPullRequest[] } } | null;
    }>(PULL_REQUEST_QUERY, { owner, name, branch });

    const node = raw.repository?.pullRequests.nodes[0];
    return node ? toView(node) : null;
  }

  async openPullRequest(request: OpenPullRequestRequest): Promise<number> {
    const base = await this.defaultBranch(request.repo);

    const created = await this.gh([
      "api",
      "--method",
      "POST",
      `/repos/${request.repo}/pulls`,
      "-f",
      `title=${request.title}`,
      "-f",
      `head=${request.branch}`,
      "-f",
      `base=${base}`,
      // Sent explicitly so the empty body is a decision rather than an omission.
      "-f",
      `body=${request.body}`,
      // `-F` rather than `-f`: this one has to arrive as a boolean, and a
      // string "false" is true to the API.
      "-F",
      `draft=${request.draft === true}`,
    ]);

    const parsed = JSON.parse(created) as { number?: number };
    if (typeof parsed.number !== "number") {
      throw new Error(`GitHub did not return a pull request number for ${request.branch}`);
    }

    return parsed.number;
  }

  async requestReview(repo: string, pullRequestNumber: number, host: string): Promise<void> {
    await this.gh([
      "api",
      "--method",
      "POST",
      `/repos/${repo}/pulls/${pullRequestNumber}/requested_reviewers`,
      "-f",
      `reviewers[]=${host}`,
    ]);
  }

  /**
   * Counted across every repository given, because counting one would send
   * every review to whoever happens to be quiet in that one.
   */
  async reviewLoad(repos: readonly string[]): Promise<Record<string, number>> {
    const load: Record<string, number> = {};

    for (const repo of repos) {
      const listed = await this.gh([
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,reviewRequests",
      ]);

      const pulls = JSON.parse(listed) as {
        reviewRequests: { login?: string; name?: string }[] | null;
      }[];

      for (const pull of pulls) {
        for (const request of pull.reviewRequests ?? []) {
          const who = request.login ?? request.name;
          if (who) load[who] = (load[who] ?? 0) + 1;
        }
      }
    }

    return load;
  }

  /**
   * What is waiting on one person, in these repositories and no others.
   *
   * The scope is not a convenience. A forge search runs across the account,
   * so asked without it this returns pull requests from every repository the
   * credential can see — including ones nobody meant this machine to touch.
   * An empty list is therefore nothing to search rather than everything.
   */
  async reviewsRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]> {
    if (repos.length === 0) return [];

    const scope = repos.map((repo) => `repo:${repo}`).join(" ");
    const data = await this.graphql<{ search: { nodes: RawReviewRequest[] } }>(
      REVIEW_REQUESTS_QUERY,
      { query: `is:pr is:open review-requested:${login} ${scope}` },
    );

    return data.search.nodes.flatMap<ReviewRequest>((node) => {
      // The search returns issues too, and the fragment leaves those empty.
      if (node.number === undefined || !node.repository) return [];

      return [
        {
          repo: node.repository.nameWithOwner,
          number: node.number,
          url: node.url ?? "",
          title: node.title ?? "",
          author: node.author?.login ?? "",
          headSha: node.headRefOid ?? "",
        },
      ];
    });
  }

  private async defaultBranch(repo: string): Promise<string> {
    return this.gh(["api", `/repos/${repo}`, "--jq", ".default_branch"]);
  }

  private async graphql<T>(query: string, variables: Record<string, string>): Promise<T> {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [key, value] of Object.entries(variables)) {
      args.push("-F", `${key}=${value}`);
    }

    const raw = await this.gh(args);
    const parsed = JSON.parse(raw) as { data?: T; errors?: { message: string }[] };

    if (parsed.errors?.length) {
      throw new Error(parsed.errors.map((e) => e.message).join("; "));
    }
    if (!parsed.data) {
      throw new Error("the GitHub GraphQL API returned no data");
    }

    return parsed.data;
  }

  private async gh(args: readonly string[]): Promise<string> {
    const result = await this.runner.run("gh", args);
    if (!result.ok) {
      throw new Error(`gh ${args[0]} ${args[1] ?? ""} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }
}

function split(repo: string): { owner: string; name: string } {
  const slash = repo.indexOf("/");
  if (slash === -1) {
    throw new Error(`${repo} is not in owner/name form`);
  }
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}

const REVIEW_STATES: readonly ReviewState[] = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
];

function toView(node: RawPullRequest): PullRequestView {
  return {
    number: node.number,
    url: node.url,
    headSha: node.headRefOid,
    isDraft: node.isDraft,
    changedFiles: node.changedFiles,
    additions: node.additions,
    deletions: node.deletions,
    reviewDecision: toDecision(node.reviewDecision),
    checks: toChecks(node),
    mergeState: toMergeState(node.mergeable, node.mergeStateStatus),
    requestedReviewers: node.reviewRequests.nodes
      .map((request) => request.requestedReviewer?.login ?? request.requestedReviewer?.slug)
      .filter((who): who is string => Boolean(who)),
    reviews: node.reviews.nodes.flatMap<ReviewSubmission>((review) => {
      // A pending review has no author, no state we care about and no commit.
      if (!review.author || !review.commit) return [];
      if (!REVIEW_STATES.includes(review.state as ReviewState)) return [];

      return [
        {
          author: review.author.login,
          state: review.state as ReviewState,
          commitSha: review.commit.oid,
          submittedAt: review.submittedAt ?? "",
        },
      ];
    }),
    threads: node.reviewThreads.nodes.flatMap<ReviewThread>((thread) => {
      const first = thread.comments.nodes[0];
      if (!first?.author) return [];

      return [
        {
          id: thread.id,
          author: first.author.login,
          body: first.body,
          isResolved: thread.isResolved,
          isOutdated: thread.isOutdated,
        },
      ];
    }),
  };
}

/**
 * The forge's verdict on the head, or nothing where it runs no checks.
 *
 * A null rollup is a real answer and not a failure: a repository with no CI
 * reports one, and a workflow told "not passing" would wait for a verdict
 * that is never coming. Seen in the wild on a release pull request whose
 * workflows are all skipped.
 */
function toChecks(node: RawPullRequest): ChecksView | null {
  const commit = node.commits?.nodes[0]?.commit;
  if (!commit?.statusCheckRollup) return null;

  return { state: toChecksState(commit.statusCheckRollup.state), commitSha: commit.oid };
}

function toChecksState(state: string): NonNullable<ChecksView>["state"] {
  switch (state) {
    case "SUCCESS":
      return "passing";
    case "FAILURE":
    case "ERROR":
      return "failing";
    default:
      // EXPECTED and PENDING both mean "no verdict yet", and an unrecognised
      // state is treated the same way: waiting is the answer that costs
      // nothing, where guessing either verdict costs a wrong move.
      return "running";
  }
}

/**
 * A conflict outranks being behind, because a branch can be both and only one
 * of them is what has to be dealt with first.
 */
function toMergeState(mergeable: string | null, mergeStateStatus: string | null): MergeState {
  if (mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY") return "conflicting";
  if (mergeStateStatus === "BEHIND") return "behind";
  if (mergeable === "MERGEABLE") return "mergeable";
  return "unknown";
}

function toDecision(value: string | null): ReviewDecision {
  switch (value) {
    case "APPROVED":
    case "CHANGES_REQUESTED":
    case "REVIEW_REQUIRED":
      return value;
    default:
      return null;
  }
}
