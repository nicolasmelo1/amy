import { describe, it, expect } from "vitest";
import { GitHubCodeHost } from "../src/GitHubCodeHost.js";
import { ScriptedRunner, whenArgsInclude } from "@amy/test-fixtures";
// The adapter no longer depends on this workflow — CodeHost is the core's
// now — but the predicates that decide what a review *means* are still the
// ticket workflow's, and the point of this fixture is that the two agree.
import { automatedReviewerSawHead, hasReviewedHead, unresolvedThreads } from "@amy/workflow-ticket-to-qa";

const HEAD = "a6d7c08aa4de0000000000000000000000000000";
const OLDER = "21adf4e6a3c80000000000000000000000000000";

/**
 * Shaped from a real answer for Northwind/northwind-backend#4926, so the
 * mapping is checked against what GitHub actually sends rather than a guess.
 */
const REAL_RESPONSE = {
  data: {
    repository: {
      pullRequests: {
        nodes: [
          {
            number: 4926,
            isDraft: false,
            reviewDecision: "CHANGES_REQUESTED",
            headRefOid: HEAD,
            reviewRequests: {
              nodes: [
                { requestedReviewer: { __typename: "User", login: "adamwbm" } },
                { requestedReviewer: { __typename: "User", login: "edsger" } },
              ],
            },
            reviews: {
              nodes: [
                {
                  author: { login: "copilot-pull-request-reviewer" },
                  state: "COMMENTED",
                  submittedAt: "2026-08-20T10:00:00Z",
                  commit: { oid: OLDER },
                },
                {
                  author: { login: "edsger" },
                  state: "CHANGES_REQUESTED",
                  submittedAt: "2026-08-20T11:00:00Z",
                  commit: { oid: OLDER },
                },
                {
                  author: { login: "copilot-pull-request-reviewer" },
                  state: "COMMENTED",
                  submittedAt: "2026-08-22T10:00:00Z",
                  commit: { oid: HEAD },
                },
              ],
            },
            reviewThreads: {
              nodes: [
                {
                  id: "T_resolved_bot",
                  isResolved: true,
                  isOutdated: true,
                  comments: {
                    nodes: [
                      { author: { login: "copilot-pull-request-reviewer" }, body: "the active mapping" },
                    ],
                  },
                },
                {
                  id: "T_open_human",
                  isResolved: false,
                  isOutdated: true,
                  comments: {
                    nodes: [{ author: { login: "edsger" }, body: "I need a little more context" }],
                  },
                },
                {
                  id: "T_open_bot",
                  isResolved: false,
                  isOutdated: false,
                  comments: {
                    nodes: [
                      { author: { login: "copilot-pull-request-reviewer" }, body: "external_invoice_id is free-form" },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  },
};

function hostFor(response: unknown, extra: { match: (c: string, a: readonly string[]) => boolean; result: Record<string, unknown> }[] = []) {
  const runner = new ScriptedRunner([
    { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify(response) } },
    ...(extra as never[]),
  ]);
  return { runner, host: new GitHubCodeHost(runner) };
}

describe("GitHubCodeHost.findPullRequest", () => {
  it("looks the pull request up by its head branch", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.findPullRequest("Northwind/northwind-backend", "ada/proj-1241-link-table");

    const argv = runner.argvFor("gh");
    expect(argv).toContain("graphql");
    expect(argv).toContain("owner=Northwind");
    expect(argv).toContain("name=northwind-backend");
    expect(argv).toContain("branch=ada/proj-1241-link-table");
  });

  it("maps the head, the decision and the requested reviewers", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = await host.findPullRequest("Northwind/northwind-backend", "b");

    expect(pr).toMatchObject({
      number: 4926,
      headSha: HEAD,
      isDraft: false,
      reviewDecision: "CHANGES_REQUESTED",
      requestedReviewers: ["adamwbm", "edsger"],
    });
  });

  it("keeps the commit each review was submitted against", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    // The whole point: the bot reviewed three commits and the human reviewed
    // an old one. Without the sha, a stale review looks current.
    expect(automatedReviewerSawHead(pr)).toBe(true);
    expect(hasReviewedHead(pr, "edsger")).toBe(false);
  });

  it("separates the bot's open threads from the human's", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    expect(unresolvedThreads(pr, "automated").map((t) => t.id)).toEqual(["T_open_bot"]);
    expect(unresolvedThreads(pr, "human").map((t) => t.id)).toEqual(["T_open_human"]);
  });

  it("returns nothing when the branch has no open pull request", async () => {
    const { host } = hostFor({ data: { repository: { pullRequests: { nodes: [] } } } });

    await expect(host.findPullRequest("Northwind/northwind-backend", "b")).resolves.toBeNull();
  });

  it("drops a pending review that has no author or commit yet", async () => {
    const { host } = hostFor({
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                ...REAL_RESPONSE.data.repository.pullRequests.nodes[0],
                reviews: { nodes: [{ author: null, state: "PENDING", submittedAt: null, commit: null }] },
              },
            ],
          },
        },
      },
    });

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    expect(pr.reviews).toEqual([]);
  });

  it("surfaces a GraphQL error instead of pretending there is no pull request", async () => {
    const { host } = hostFor({ errors: [{ message: "Bad credentials" }] });

    await expect(host.findPullRequest("Northwind/northwind-backend", "b")).rejects.toThrow(
      /Bad credentials/,
    );
  });

  it("refuses a repository that is not in owner/name form", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    await expect(host.findPullRequest("northwind-backend", "b")).rejects.toThrow(/owner\/name/);
  });
});

describe("GitHubCodeHost.openPullRequest", () => {
  it("opens against the repository's default branch, with an empty body", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("/repos/Northwind/northwind-backend", ".default_branch"), result: { stdout: "main" } },
      { match: whenArgsInclude("/pulls", "POST"), result: { stdout: JSON.stringify({ number: 4950 }) } },
    ]);

    const number = await new GitHubCodeHost(runner).openPullRequest({
      repo: "Northwind/northwind-backend",
      branch: "ada/proj-1239-total-is-wrong",
      title: "PROJ-1239: The total is wrong on the invoice",
      body: "",
    });

    expect(number).toBe(4950);

    const argv = runner.argvFor("gh", 1);
    expect(argv).toContain("title=PROJ-1239: The total is wrong on the invoice");
    expect(argv).toContain("head=ada/proj-1239-total-is-wrong");
    expect(argv).toContain("base=main");
    // Sent explicitly, so the empty body is a decision and not an omission.
    expect(argv).toContain("body=");
  });

  it("fails when GitHub does not return a number", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude(".default_branch"), result: { stdout: "main" } },
      { match: whenArgsInclude("/pulls"), result: { stdout: "{}" } },
    ]);

    await expect(
      new GitHubCodeHost(runner).openPullRequest({
        repo: "Northwind/northwind-backend",
        branch: "b",
        title: "t",
        body: "",
      }),
    ).rejects.toThrow(/did not return a pull request number/);
  });
});

describe("GitHubCodeHost.requestReview", () => {
  it("asks the named person for a review", async () => {
    const runner = new ScriptedRunner();

    await new GitHubCodeHost(runner).requestReview("Northwind/northwind-backend", 4940, "edsger");

    const argv = runner.argvFor("gh");
    expect(argv).toContain("/repos/Northwind/northwind-backend/pulls/4940/requested_reviewers");
    expect(argv).toContain("reviewers[]=edsger");
  });

  it("does not swallow a refusal from GitHub", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("requested_reviewers"), result: { exitCode: 1, stderr: "Not Found" } },
    ]);

    await expect(
      new GitHubCodeHost(runner).requestReview("Northwind/northwind-backend", 4940, "ghost"),
    ).rejects.toThrow(/Not Found/);
  });
});

describe("GitHubCodeHost.reviewLoad", () => {
  it("counts open review requests across every repository", async () => {
    const backend = [
      { number: 1, reviewRequests: [{ login: "edsger" }, { login: "adamwbm" }] },
      { number: 2, reviewRequests: [{ login: "edsger" }] },
    ];
    const frontend = [{ number: 3, reviewRequests: [{ login: "adamwbm" }] }];

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("northwind-backend"), result: { stdout: JSON.stringify(backend) } },
      { match: whenArgsInclude("northwind-frontend"), result: { stdout: JSON.stringify(frontend) } },
    ]);

    const load = await new GitHubCodeHost(runner).reviewLoad([
      "Northwind/northwind-backend",
      "Northwind/northwind-frontend",
    ]);

    // Counting one repository alone would make adamwbm look the lightest.
    expect(load).toEqual({ edsger: 2, adamwbm: 2 });
  });

  it("treats a pull request with no requested reviewer as nothing to count", async () => {
    const runner = new ScriptedRunner([
      {
        match: whenArgsInclude("pr", "list"),
        result: { stdout: JSON.stringify([{ number: 1, reviewRequests: null }]) },
      },
    ]);

    await expect(
      new GitHubCodeHost(runner).reviewLoad(["Northwind/northwind-backend"]),
    ).resolves.toEqual({});
  });
});
