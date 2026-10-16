import { describe, it, expect } from "vitest";
import { GitHubCodeHost } from "../src/GitHubCodeHost.js";
import { assertValidGhAnswer, assertValidGhInvocation, restExample, ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
// The adapter no longer depends on this workflow — CodeHost is the core's
// now — but the predicates that decide what a review *means* are still the
// ticket workflow's, and the point of this fixture is that the two agree.
import { automatedReviewerSawHead, hasReviewedHead, unresolvedThreads } from "@amykit/workflow-ticket-to-qa";

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
            url: "https://github.example.test/Northwind/northwind-backend/pull/4926",
            isDraft: false,
            reviewDecision: "CHANGES_REQUESTED",
            headRefOid: HEAD,
            headRefName: "ada/proj-1241-link-table",
            changedFiles: 7,
            additions: 214,
            deletions: 31,
            merged: false,
            baseRefName: "main",
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            commits: {
              nodes: [{ commit: { oid: HEAD, statusCheckRollup: { state: "SUCCESS" } } }],
            },
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
                  path: "src/invoices/link.ts",
                  comments: {
                    nodes: [
                      { author: { login: "copilot-pull-request-reviewer" }, body: "the active mapping", createdAt: "2026-08-20T12:00:00Z" },
                    ],
                  },
                },
                {
                  id: "T_open_human",
                  isResolved: false,
                  isOutdated: true,
                  path: "src/invoices/link.ts",
                  comments: {
                    nodes: [{ author: { login: "edsger" }, body: "I need a little more context", createdAt: "2026-08-20T12:00:00Z" }],
                  },
                },
                {
                  id: "T_open_bot",
                  isResolved: false,
                  isOutdated: false,
                  path: "src/invoices/external.ts",
                  comments: {
                    nodes: [
                      { author: { login: "copilot-pull-request-reviewer" }, body: "external_invoice_id is free-form", createdAt: "2026-08-20T12:00:00Z" },
                    ],
                  },
                },
                // The shape that motivated this: the thread's author replied
                // to their own comment, so what the thread is waiting on is
                // not what it started with.
                {
                  id: "T_replied_bot",
                  isResolved: false,
                  isOutdated: false,
                  path: "src/invoices/external.ts",
                  comments: {
                    nodes: [
                      { author: { login: "copilot-pull-request-reviewer" }, body: "external_invoice_id is free-form", createdAt: "2026-08-24T10:00:00Z" },
                      { author: { login: "copilot-pull-request-reviewer" }, body: "correction: it must stay in the form the API returns", createdAt: "2026-08-24T11:00:00Z" },
                    ],
                  },
                },
                // The machine answered and the reviewer came back inside the
                // thread — the last speaker decides whose turn it is.
                {
                  id: "T_answered_then_human",
                  isResolved: false,
                  isOutdated: false,
                  path: "src/invoices/variables.ts",
                  comments: {
                    nodes: [
                      { author: { login: "edsger" }, body: "why a new variable?", createdAt: "2026-08-23T09:00:00Z" },
                      { author: { login: "amy-machine" }, body: "inlined it in 4b2f1c", createdAt: "2026-08-23T15:00:00Z" },
                      { author: { login: "edsger" }, body: "that still leaves the old one behind", createdAt: "2026-08-24T09:30:00Z" },
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
  // The specific scripts first: the runner answers with the first one that
  // matches, and a catch-all placed ahead of them would answer for them.
  const runner = new ScriptedRunner([
    ...(extra as never[]),
    { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify(response) } },
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

    expect(unresolvedThreads(pr, "automated").map((t) => t.id)).toEqual([
      "T_open_bot",
      "T_replied_bot",
    ]);
    expect(unresolvedThreads(pr, "human").map((t) => t.id)).toEqual([
      "T_open_human",
      "T_answered_then_human",
    ]);
  });

  it("carries the whole conversation a thread holds, oldest first", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    // A reply written inside the thread reaches every consumer of the view;
    // the reply that once sat one field away is on the thread it belongs to.
    const replied = pr.threads.find((t) => t.id === "T_replied_bot")!;
    expect(replied.comments.map((c) => c.body)).toEqual([
      "external_invoice_id is free-form",
      "correction: it must stay in the form the API returns",
    ]);
    expect(replied.comments.map((c) => c.createdAt)).toEqual([
      "2026-08-24T10:00:00Z",
      "2026-08-24T11:00:00Z",
    ]);
  });

  it("keeps author and body as the opening comment's, so what a thread is about does not move", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    // A consumer that never asked for the conversation is unaffected: the
    // bot's thread that grew a correction still reads as the bot's, about
    // what the bot opened it with.
    const replied = pr.threads.find((t) => t.id === "T_replied_bot")!;
    expect(replied.author).toBe("copilot-pull-request-reviewer");
    expect(replied.body).toBe("external_invoice_id is free-form");
    expect(unresolvedThreads(pr, "automated").map((t) => t.id)).toContain("T_replied_bot");
  });

  it("answers whose turn a thread is from the view alone, with the last comment's author", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    // No second call: every turn signal rides on the same reply the view
    // already carried.
    const waitingOnHuman = pr.threads.find((t) => t.id === "T_answered_then_human")!;
    expect(waitingOnHuman.comments.at(-1)!.author).toBe("edsger");
    expect(waitingOnHuman.comments.at(-1)!.body).toBe("that still leaves the old one behind");

    const waitingOnNobody = pr.threads.find((t) => t.id === "T_open_bot")!;
    expect(waitingOnNobody.comments.at(-1)!.author).toBe("copilot-pull-request-reviewer");
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

  it("opens against the base the repository named, without asking the forge", async () => {
    const runner = new ScriptedRunner([
      // No default_branch scripted: a call to it would fail the run, so the
      // assertion below also proves the forge was never asked.
      { match: whenArgsInclude("/pulls", "POST"), result: { stdout: JSON.stringify({ number: 4951 }) } },
    ]);

    const number = await new GitHubCodeHost(runner, {
      baseBranch: { "Northwind/northwind-backend": "trunk" },
    }).openPullRequest({
      repo: "Northwind/northwind-backend",
      branch: "ada/proj-1239-total-is-wrong",
      title: "PROJ-1239: The total is wrong on the invoice",
      body: "",
    });

    expect(number).toBe(4951);

    const argv = runner.argvFor("gh", 0);
    expect(argv).toContain("base=trunk");
  });

  it("keeps the forge's own default for a repository that named none, in the same install", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("/repos/Northwind/northwind-frontend", ".default_branch"), result: { stdout: "main" } },
      { match: whenArgsInclude("/pulls", "POST"), result: { stdout: JSON.stringify({ number: 4952 }) } },
    ]);

    await new GitHubCodeHost(runner, {
      baseBranch: { "Northwind/northwind-backend": "trunk" },
    }).openPullRequest({
      repo: "Northwind/northwind-frontend",
      branch: "b",
      title: "t",
      body: "",
    });

    const argv = runner.argvFor("gh", 1);
    expect(argv).toContain("base=main");
  });

  it("answers the request's own base before the mapped one, when a caller names it", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("/pulls", "POST"), result: { stdout: JSON.stringify({ number: 4953 }) } },
    ]);

    await new GitHubCodeHost(runner, {
      baseBranch: { "Northwind/northwind-backend": "trunk" },
    }).openPullRequest({
      repo: "Northwind/northwind-backend",
      branch: "b",
      title: "t",
      base: "develop",
      body: "",
    });

    const argv = runner.argvFor("gh", 0);
    expect(argv).toContain("base=develop");
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

describe("GitHubCodeHost.resolveReviewThread", () => {
  // The shape the plan was verified against: one mutation, the thread id the
  // view already carried as its only variable, one call.
  it("closes a thread by its id in one call", async () => {
    const runner = new ScriptedRunner([
      {
        match: whenArgsInclude("graphql"),
        result: {
          stdout: JSON.stringify({
            data: { resolveReviewThread: { thread: { id: "T1", isResolved: true } } },
          }),
        },
      },
    ]);

    await new GitHubCodeHost(runner).resolveReviewThread("T1");

    const asked = runner.argvFor("gh").join(" ");
    expect(asked).toContain("mutation Thread($id: ID!)");
    expect(asked).toContain("resolveReviewThread(input: {threadId: $id})");
    expect(asked).toContain("id=T1");
    expect(runner.calls).toHaveLength(1);
  });

  it("closes the unresolvable twin through the same one call", async () => {
    const runner = new ScriptedRunner([
      {
        match: whenArgsInclude("graphql"),
        result: {
          stdout: JSON.stringify({
            data: { unresolveReviewThread: { thread: { id: "T1", isResolved: false } } },
          }),
        },
      },
    ]);

    await new GitHubCodeHost(runner).unresolveReviewThread("T1");

    const asked = runner.argvFor("gh").join(" ");
    expect(asked).toContain("unresolveReviewThread(input: {threadId: $id})");
    expect(runner.calls).toHaveLength(1);
  });

  it("surfaces a GraphQL error instead of pretending the thread closed", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify({ errors: [{ message: "Thread already resolved" }] }) } },
    ]);

    await expect(new GitHubCodeHost(runner).resolveReviewThread("T1")).rejects.toThrow(
      /Thread already resolved/,
    );
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

/** The base fixture with one pull request field replaced. */
function withNode(fields: Record<string, unknown>): unknown {
  const node = REAL_RESPONSE.data.repository.pullRequests.nodes[0];
  return {
    data: { repository: { pullRequests: { nodes: [{ ...node, ...fields }] } } },
  };
}

describe("GitHubCodeHost: what the forge says about the branch", () => {
  it("maps the size the forge already counted", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    expect(await host.findPullRequest("Northwind/northwind-backend", "b")).toMatchObject({
      changedFiles: 7,
      additions: 214,
      deletions: 31,
    });
  });

  it("keeps the commit the checks ran against, so a green older head is visible", async () => {
    const { host } = hostFor(
      withNode({
        commits: { nodes: [{ commit: { oid: OLDER, statusCheckRollup: { state: "SUCCESS" } } }] },
      }),
    );

    const pr = (await host.findPullRequest("Northwind/northwind-backend", "b"))!;

    expect(pr.checks).toEqual({ state: "passing", commitSha: OLDER });
    expect(pr.headSha).toBe(HEAD);
  });

  // Seen on a real release pull request whose workflows are all skipped.
  // Told apart from "not passing", or a repository with no CI waits forever.
  it("reports no checks where the forge ran none", async () => {
    const { host } = hostFor(
      withNode({ commits: { nodes: [{ commit: { oid: HEAD, statusCheckRollup: null } }] } }),
    );

    expect((await host.findPullRequest("Northwind/northwind-backend", "b"))?.checks).toBeNull();
  });

  // A forge that answered without the head commit ran no checks. Reading it
  // as a crash takes the tick down and the ticket with it, which is a worse
  // answer than the true one.
  it("reports no checks where the forge did not answer with a head commit", async () => {
    // `commits` is always in a GraphQL answer that selected it; a pull
    // request with no head commit answers it with no nodes.
    const { host } = hostFor(withNode({ commits: { nodes: [] } }));

    expect((await host.findPullRequest("Northwind/northwind-backend", "b"))?.checks).toBeNull();
  });

  it.each([
    ["SUCCESS", "passing"],
    ["FAILURE", "failing"],
    ["ERROR", "failing"],
    ["PENDING", "running"],
    ["EXPECTED", "running"],
  ])("reads a %s rollup as %s", async (state, expected) => {
    const { host } = hostFor(
      withNode({
        commits: { nodes: [{ commit: { oid: HEAD, statusCheckRollup: { state } } }] },
      }),
    );

    expect((await host.findPullRequest("Northwind/northwind-backend", "b"))?.checks?.state).toBe(
      expected,
    );
  });

  it.each([
    ["MERGEABLE", "CLEAN", "mergeable"],
    ["CONFLICTING", "DIRTY", "conflicting"],
    ["MERGEABLE", "BEHIND", "behind"],
    ["UNKNOWN", "UNKNOWN", "unknown"],
    // The forge works a merge out asynchronously, and says so. Guessing
    // either way here is how a branch gets handed over as mergeable before
    // anybody knows whether it is.
    ["UNKNOWN", "CLEAN", "unknown"],
  ])("reads %s/%s as %s", async (mergeable, mergeStateStatus, expected) => {
    const { host } = hostFor(withNode({ mergeable, mergeStateStatus }));

    expect((await host.findPullRequest("Northwind/northwind-backend", "b"))?.mergeState).toBe(
      expected,
    );
  });

  // Both at once is a real state, and only one of them is what has to be
  // dealt with first.
  it("calls a branch that both conflicts and is behind a conflict", async () => {
    const { host } = hostFor(withNode({ mergeable: "CONFLICTING", mergeStateStatus: "BEHIND" }));

    expect((await host.findPullRequest("Northwind/northwind-backend", "b"))?.mergeState).toBe(
      "conflicting",
    );
  });
});

const SEARCH_RESPONSE = {
  data: {
    search: {
      nodes: [
        {
          number: 4886,
          title: "Improve logging around knit syncs",
          url: "https://github.example.test/Northwind/northwind-backend/pull/4886",
          headRefOid: HEAD,
          author: { login: "alan" },
          repository: { nameWithOwner: "Northwind/northwind-backend" },
        },
        // The search returns issues too, and the fragment leaves those empty.
        {},
      ],
    },
  },
};

describe("GitHubCodeHost.reviewsRequestedOf", () => {
  it("asks only about the repositories it was given", async () => {
    const { runner, host } = hostFor(SEARCH_RESPONSE);

    await host.reviewsRequestedOf("edsger", [
      "Northwind/northwind-backend",
      "Northwind/northwind-frontend",
    ]);

    const asked = runner.argvFor("gh").join(" ");
    expect(asked).toContain("review-requested:edsger");
    expect(asked).toContain("repo:Northwind/northwind-backend");
    expect(asked).toContain("repo:Northwind/northwind-frontend");
    expect(asked).toContain("is:open");
  });

  // The one that matters. A forge search runs across the account, so an
  // unscoped one returns work from every repository the credential can see.
  it("searches nothing at all when it was given no repository", async () => {
    const { runner, host } = hostFor(SEARCH_RESPONSE);

    expect(await host.reviewsRequestedOf("edsger", [])).toEqual([]);
    expect(runner.calls).toHaveLength(0);
  });

  it("maps a pull request and drops what is not one", async () => {
    const { host } = hostFor(SEARCH_RESPONSE);

    expect(await host.reviewsRequestedOf("edsger", ["Northwind/northwind-backend"])).toEqual([
      {
        repo: "Northwind/northwind-backend",
        number: 4886,
        title: "Improve logging around knit syncs",
        url: "https://github.example.test/Northwind/northwind-backend/pull/4886",
        author: "alan",
        headSha: HEAD,
      },
    ]);
  });
});


const BY_NUMBER_RESPONSE = {
  data: {
    repository: {
      pullRequest: REAL_RESPONSE.data.repository.pullRequests.nodes[0],
    },
  },
};

describe("GitHubCodeHost.pullRequest", () => {
  it("looks one up by its number, with no open-only filter in the query", async () => {
    const { runner, host } = hostFor(BY_NUMBER_RESPONSE);

    const pr = await host.pullRequest("Northwind/northwind-backend", 4926);

    expect(pr?.number).toBe(4926);
    const asked = runner.argvFor("gh").join(" ");
    // The number is what the search cannot carry, so the document asks for
    // the pull request by it and never by a branch.
    expect(asked).toContain("number=4926");
    // The filter, not the field: the view reads the head branch back, and
    // only a `headRefName:` argument would be a search by it.
    expect(asked).not.toContain("headRefName: $branch");
    expect(asked).toContain("pullRequest(number: $number)");
  });

  it("returns nothing when the number is not a pull request", async () => {
    const { host } = hostFor({ data: { repository: { pullRequest: null } } });

    await expect(host.pullRequest("Northwind/northwind-backend", 1)).resolves.toBeNull();
  });

  it("says what a merged one merged into", async () => {
    const { host } = hostFor({
      data: {
        repository: {
          pullRequest: {
            ...REAL_RESPONSE.data.repository.pullRequests.nodes[0],
            merged: true,
            baseRefName: "trunk",
          },
        },
      },
    });

    const pr = await host.pullRequest("Northwind/northwind-backend", 4926);

    expect(pr).toMatchObject({ merged: true, base: "trunk" });
  });
});

describe("GitHubCodeHost.pullRequestAncestry", () => {
  it.each([
    ["OPEN", false, "open"],
    ["CLOSED", true, "merged"],
    ["CLOSED", false, "closed-unmerged"],
  ] as const)("maps a %s parent with merged=%s without making a workflow name GitHub", async (state, merged, expected) => {
    const response = {
      data: { repository: { pullRequest: { state, merged, headRefName: "ada/parent", baseRefName: "main" } } },
    };
    const { runner, host } = hostFor(response);

    await expect(host.pullRequestAncestry("Northwind/northwind-backend", 4926)).resolves.toEqual({
      state: expected,
      headBranch: "ada/parent",
      baseBranch: "main",
    });
    expect(runner.argvFor("gh").join(" ")).toContain("pullRequest(number: $number)");
  });

  it("says absent instead of guessing a base", async () => {
    const { host } = hostFor({ data: { repository: { pullRequest: null } } });

    await expect(host.pullRequestAncestry("Northwind/northwind-backend", 4926)).resolves.toEqual({
      state: "absent",
    });
  });

  it("leaves an unknown repository unavailable instead of calling it absent", async () => {
    const { host } = hostFor({ data: { repository: null } });

    await expect(host.pullRequestAncestry("Northwind/northwind-backend", 4926)).resolves.toBeNull();
  });
});

describe("GitHubCodeHost.merge", () => {
  it("merges by the method the caller named", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.merge("Northwind/northwind-backend", 4926, "squash");

    const argv = runner.argvFor("gh");
    expect(argv).toContain("--method");
    expect(argv).toContain("PUT");
    expect(argv).toContain("/repos/Northwind/northwind-backend/pulls/4926/merge");
    expect(argv).toContain("merge_method=squash");
  });

  it("does not swallow a refusal from GitHub", async () => {
    const { host } = hostFor(REAL_RESPONSE, [
      { match: whenArgsInclude("/merge"), result: { ok: false, exitCode: 1, stderr: "Merge blocked by ruleset" } },
    ]);

    await expect(host.merge("Northwind/northwind-backend", 4926, "squash")).rejects.toThrow(
      /Merge blocked by ruleset/,
    );
  });
});

describe("GitHubCodeHost.submitReview", () => {
  it("submits the state the caller decided on", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.submitReview("Northwind/northwind-backend", 4926, {
      state: "APPROVED",
      body: "the mapping holds",
    });

    const argv = runner.argvFor("gh");
    expect(argv).toContain("--method");
    expect(argv).toContain("POST");
    expect(argv).toContain("/repos/Northwind/northwind-backend/pulls/4926/reviews");
    // The REST API's word for it, not the state the review is read back as.
    expect(argv).toContain("event=APPROVE");
    expect(argv).toContain("body=the mapping holds");
  });

  // The port speaks the state a review is read as; the REST API takes its
  // own verbs, and answers 422 to the past tense.
  it.each([
    ["APPROVED", "APPROVE"],
    ["CHANGES_REQUESTED", "REQUEST_CHANGES"],
    ["COMMENTED", "COMMENT"],
  ] as const)("submits %s as the event %s", async (state, event) => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.submitReview("Northwind/northwind-backend", 4926, { state, body: "b" });

    expect(runner.argvFor("gh")).toContain(`event=${event}`);
  });

  it("refuses to submit a dismissal, which is done to a review and never submitted as one", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await expect(
      host.submitReview("Northwind/northwind-backend", 4926, { state: "DISMISSED", body: "" }),
    ).rejects.toThrow(/cannot be submitted as DISMISSED/);
    expect(runner.calls).toHaveLength(0);
  });

  it("sends the empty body rather than leaving it to the API's default", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.submitReview("Northwind/northwind-backend", 4926, { state: "APPROVED", body: "" });

    expect(runner.argvFor("gh")).toContain("body=");
  });
});

describe("GitHubCodeHost.createIssue", () => {
  it("files one and returns its number", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE, [
      { match: whenArgsInclude("/issues"), result: { stdout: JSON.stringify({ number: 1204 }) } },
    ]);

    const number = await host.createIssue("Northwind/northwind-backend", {
      title: "the aggregate is duplicated",
      body: "Consume the DB-layer aggregate from TBO-1236.",
    });

    expect(number).toBe(1204);
    const argv = runner.argvFor("gh");
    expect(argv).toContain("--method");
    expect(argv).toContain("POST");
    expect(argv).toContain("/repos/Northwind/northwind-backend/issues");
    expect(argv).toContain("title=the aggregate is duplicated");
  });

  it("fails when GitHub does not return a number", async () => {
    const { host } = hostFor(REAL_RESPONSE, [
      { match: whenArgsInclude("/issues"), result: { stdout: "{}" } },
    ]);

    await expect(
      host.createIssue("Northwind/northwind-backend", { title: "t", body: "b" }),
    ).rejects.toThrow(/did not return an issue number/);
  });
});

describe("GitHubCodeHost.commitStatuses", () => {
  it("reads the statuses the forge recorded on one commit", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE, [
      {
        match: whenArgsInclude("/status"),
        result: {
          stdout: JSON.stringify({
            state: "success",
            statuses: [
              { context: "ci/build", state: "SUCCESS" },
              { context: "freeze", state: "FAILURE" },
              { context: "deploy", state: "PENDING" },
            ],
          }),
        },
      },
    ]);

    const statuses = await host.commitStatuses("Northwind/northwind-backend", HEAD);

    expect(statuses).toEqual([
      { context: "ci/build", state: "passing" },
      { context: "freeze", state: "failing" },
      { context: "deploy", state: "running" },
    ]);
    expect(runner.argvFor("gh")).toContain(`/repos/Northwind/northwind-backend/commits/${HEAD}/status`);
  });

  it("answers an empty list where the forge ran nothing, which is a real answer", async () => {
    const { host } = hostFor(REAL_RESPONSE, [
      { match: whenArgsInclude("/status"), result: { stdout: JSON.stringify({ state: "none", statuses: [] }) } },
    ]);

    await expect(host.commitStatuses("Northwind/northwind-backend", HEAD)).resolves.toEqual([]);
  });
});

describe("GitHubCodeHost review threads", () => {
  it("carries the file each thread is on, as the forge returned it", async () => {
    const withPaths = structuredClone(REAL_RESPONSE);
    const threads = withPaths.data.repository.pullRequests.nodes[0]!.reviewThreads.nodes as { path?: string }[];
    threads[0]!.path = "src/invoices/total.ts";
    threads[1]!.path = "src/invoices/currency.ts";
    const { host } = hostFor(withPaths);

    const view = await host.findPullRequest("Northwind/northwind-backend", "ada/proj-1241-link-table");

    expect(view?.threads[0]?.path).toBe("src/invoices/total.ts");
    expect(view?.threads[1]?.path).toBe("src/invoices/currency.ts");
  });

  it("asks for the path in both the by-branch and the by-number read", async () => {
    const { runner, host } = hostFor(REAL_RESPONSE);

    await host.findPullRequest("Northwind/northwind-backend", "ada/proj-1241-link-table");
    await host.pullRequest("Northwind/northwind-backend", 4926).catch(() => null);

    const queries = runner.calls.map((call) => call.args.find((arg) => arg.startsWith("query=")) ?? "");
    expect(queries.filter((query) => /reviewThreads[\s\S]*\bpath\b/.test(query))).toHaveLength(2);
  });
});

describe("GitHubCodeHost.commitStatuses, as the forge writes them", () => {
  it("reads the contract's own combined-status example, in lower case, as passing", async () => {
    const example = restExample("combined-commit-status") as { statuses: { state: string }[] };
    expect(example.statuses.every((status) => status.state === "success")).toBe(true);
    const { host } = hostFor(REAL_RESPONSE, [
      { match: whenArgsInclude("/status"), result: { stdout: JSON.stringify(example) } },
    ]);

    const statuses = await host.commitStatuses("Northwind/northwind-backend", HEAD);

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status.state === "passing")).toBe(true);
  });

  it("reads failure and error in lower case as failing, and pending as running", async () => {
    const { host } = hostFor(REAL_RESPONSE, [
      {
        match: whenArgsInclude("/status"),
        result: {
          stdout: JSON.stringify({
            state: "failure",
            statuses: [
              { context: "ci/build", state: "failure" },
              { context: "ci/lint", state: "error" },
              { context: "deploy", state: "pending" },
            ],
          }),
        },
      },
    ]);

    await expect(host.commitStatuses("Northwind/northwind-backend", HEAD)).resolves.toEqual([
      { context: "ci/build", state: "failing" },
      { context: "ci/lint", state: "failing" },
      { context: "deploy", state: "running" },
    ]);
  });
});

describe("GitHubCodeHost.changesRequestedOf", () => {
  const REVIEWED = {
    ...SEARCH_RESPONSE,
    data: {
      search: {
        nodes: [
          SEARCH_RESPONSE.data.search.nodes[0],
          // Also reviewed but not with changes requested: the read below drops it.
          {
            ...SEARCH_RESPONSE.data.search.nodes[0],
            number: 4900,
            repository: { nameWithOwner: "Northwind/northwind-frontend" },
          },
        ],
      },
    },
  };

  const APPROVED_VIEW = {
    data: {
      repository: {
        pullRequest: {
          ...REAL_RESPONSE.data.repository.pullRequests.nodes[0],
          number: 4900,
          reviews: {
            nodes: [
              {
                author: { login: "edsger" },
                state: "APPROVED",
                submittedAt: "2026-08-20T11:00:00Z",
                commit: { oid: HEAD },
              },
            ],
          },
        },
      },
    },
  };

  it("asks the mirrored search, scoped to the repositories it was given", async () => {
    const { runner, host } = hostFor(REVIEWED, [
      { match: whenArgsInclude("pullRequest(number"), result: { stdout: JSON.stringify(APPROVED_VIEW) } },
    ]);

    await host.changesRequestedOf("edsger", ["Northwind/northwind-backend"]);

    const asked = runner.argvFor("gh").join(" ");
    expect(asked).toContain("reviewed-by:edsger");
    expect(asked).toContain("is:open");
    expect(asked).toContain("repo:Northwind/northwind-backend");
  });

  it("keeps the ones this login's review still leaves changes requested on", async () => {
    const changesRequestedView = {
      data: {
        repository: {
          pullRequest: {
            ...REAL_RESPONSE.data.repository.pullRequests.nodes[0],
            reviews: {
              nodes: [
                {
                  author: { login: "edsger" },
                  state: "CHANGES_REQUESTED",
                  submittedAt: "2026-08-20T11:00:00Z",
                  commit: { oid: HEAD },
                },
              ],
            },
          },
        },
      },
    };
    // The by-number read is scripted first: the runner answers with the
    // first match, and the search response would swallow it the other way.
    // This login's review stands as CHANGES_REQUESTED on one candidate and
    // as APPROVED on the other, so the scripted runner answers by the number
    // in the query and the adapter keeps exactly the first.
    const runner = new ScriptedRunner([
      {
        match: (_command, args) =>
          args.some((arg) => arg.includes("graphql")) && args.some((arg) => arg.includes("number=4886")),
        result: { stdout: JSON.stringify(changesRequestedView) },
      },
      {
        match: (_command, args) =>
          args.some((arg) => arg.includes("graphql")) && args.some((arg) => arg.includes("number=4900")),
        result: { stdout: JSON.stringify(APPROVED_VIEW) },
      },
      { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify(REVIEWED) } },
    ]);
    const host = new GitHubCodeHost(runner);

    expect(await host.changesRequestedOf("edsger", ["Northwind/northwind-backend"])).toEqual([
      {
        repo: "Northwind/northwind-backend",
        number: 4886,
        title: "Improve logging around knit syncs",
        url: "https://github.example.test/Northwind/northwind-backend/pull/4886",
        author: "alan",
        headSha: HEAD,
      },
    ]);
  });

  it("drops a pull request whose only review from this login is an approval", async () => {
    const onlyApproved = {
      data: { search: { nodes: [REVIEWED.data.search.nodes[1]] } },
    };
    const { host } = hostFor(onlyApproved, [
      { match: whenArgsInclude("pullRequest(number"), result: { stdout: JSON.stringify(APPROVED_VIEW) } },
    ]);

    expect(await host.changesRequestedOf("edsger", ["Northwind/northwind-frontend"])).toEqual([]);
  });

  it("searches nothing at all when it was given no repository", async () => {
    const { runner, host } = hostFor(REVIEWED);

    expect(await host.changesRequestedOf("edsger", [])).toEqual([]);
    expect(runner.calls).toHaveLength(0);
  });
});

describe("GitHubCodeHost: the view carries what a merge decision needs", () => {
  it("says whether the pull request merged and what its base is", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const pr = await host.findPullRequest("Northwind/northwind-backend", "b");

    expect(pr).toMatchObject({ merged: false, base: "main" });
  });
});

/**
 * The fields one `gh api graphql` call claims, in order: the document as
 * `-f query=`, and every variable as `-f`/`-F <name>=`. `gh` refuses a field
 * claimed twice before GitHub is reached, so a collision is visible in the
 * argv alone.
 */
function fieldsClaimed(argv: readonly string[]): string[] {
  const fields: string[] = [];
  for (let i = 0; i < argv.length - 1; i += 1) {
    if (argv[i] === "-f" || argv[i] === "-F") fields.push(argv[i + 1]!.split("=")[0]!);
  }
  return fields;
}

describe("GitHubCodeHost: a GraphQL call never claims the document's own field twice", () => {
  const GRAPHQL_READS: [string, (host: GitHubCodeHost) => Promise<unknown>][] = [
    ["findPullRequest", (host) => host.findPullRequest("Northwind/northwind-backend", "ada/proj-1239")],
    ["pullRequest", (host) => host.pullRequest("Northwind/northwind-backend", 4926)],
    ["reviewsRequestedOf", (host) => host.reviewsRequestedOf("edsger", ["Northwind/northwind-backend"])],
    ["changesRequestedOf", (host) => host.changesRequestedOf("edsger", ["Northwind/northwind-backend"])],
    ["resolveReviewThread", (host) => host.resolveReviewThread("T_open_bot")],
    ["unresolveReviewThread", (host) => host.unresolveReviewThread("T_open_bot")],
  ];

  it.each(GRAPHQL_READS)("%s sends no variable named like the document field", async (_name, call) => {
    // The specific answers come first: the runner answers with the first
    // script that matches, and every one of these calls says "graphql".
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("pullRequest(number"), result: { stdout: JSON.stringify(BY_NUMBER_RESPONSE) } },
      { match: whenArgsInclude("pullRequests(headRefName"), result: { stdout: JSON.stringify(REAL_RESPONSE) } },
      {
        match: whenArgsInclude("mutation Thread", "unresolveReviewThread"),
        result: { stdout: JSON.stringify({ data: { unresolveReviewThread: { thread: { id: "T_open_bot", isResolved: false } } } }) },
      },
      {
        match: whenArgsInclude("mutation Thread"),
        result: { stdout: JSON.stringify({ data: { resolveReviewThread: { thread: { id: "T_open_bot", isResolved: true } } } }) },
      },
      { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify(SEARCH_RESPONSE) } },
    ]);
    const host = new GitHubCodeHost(runner);

    await call(host);

    const graphqlCalls = runner.callsTo("gh").filter((c) => c.args[1] === "graphql");
    expect(graphqlCalls.length).toBeGreaterThan(0);
    for (const { args } of graphqlCalls) {
      const fields = fieldsClaimed(args);
      expect(fields.filter((field) => field === "query")).toEqual(["query"]);
      expect(new Set(fields).size).toBe(fields.length);
    }
  });

  it("names the search as its own variable, not as the document's field", async () => {
    const { runner, host } = hostFor(SEARCH_RESPONSE);

    await host.reviewsRequestedOf("edsger", ["Northwind/northwind-backend"]);

    const argv = runner.argvFor("gh");
    expect(argv).not.toContainEqual(expect.stringMatching(/^query=is:pr/));
    expect(argv).toContainEqual(expect.stringMatching(/^search=is:pr is:open review-requested:edsger/));
  });
});

/** A forge that answers a search by its qualifier and a read by its number. */
function searchingHost(searches: Record<string, unknown[]>, views: Record<number, Record<string, unknown>>) {
  const node = REAL_RESPONSE.data.repository.pullRequests.nodes[0]!;
  const asked: string[][] = [];
  const answer = (args: readonly string[]): unknown => {
    if (args.some((arg) => arg.startsWith("query=") && arg.includes("PullRequestByNumber"))) {
      const number = Number(args.find((arg) => arg.startsWith("number="))!.slice("number=".length));
      const view = views[number];
      return { data: { repository: { pullRequest: view ? { ...node, number, ...view } : null } } };
    }
    const search = args.find((arg) => arg.startsWith("search=")) ?? "";
    const key = Object.keys(searches).find((qualifier) => search.includes(qualifier));
    return { data: { search: { nodes: key ? searches[key] : [] } } };
  };
  const runner = {
    async run(_command: string, args: readonly string[]) {
      asked.push([...args]);
      const request = assertValidGhInvocation(args);
      const stdout = JSON.stringify(answer(args));
      assertValidGhAnswer(request, stdout);
      return { ok: true, exitCode: 0, stdout, stderr: "" };
    },
  };
  return { asked: () => asked.flat().join(" "), host: new GitHubCodeHost(runner as never) };
}

const hit = (number: number, title: string) => ({ ...SEARCH_RESPONSE.data.search.nodes[0], number, title });

describe("GitHubCodeHost.findPullRequestMentioning", () => {
  it("finds a pull request whose branch no longer matches, by the id in its title", async () => {
    const { asked, host } = searchingHost(
      { "is:open": [hit(4950, "BILL-4021: show the currency on the invoice total")] },
      { 4950: { headRefOid: HEAD } },
    );

    const view = await host.findPullRequestMentioning("Northwind/northwind-backend", "BILL-4021");

    expect(view?.number).toBe(4950);
    expect(asked()).toContain("repo:Northwind/northwind-backend");
    expect(asked()).toContain('in:title "BILL-4021"');
  });

  it("finds a merged one when nothing open names the id", async () => {
    const { host } = searchingHost(
      { "is:merged": [hit(4951, "BILL-4021 show the currency")] },
      { 4951: { merged: true } },
    );

    const view = await host.findPullRequestMentioning("Northwind/northwind-backend", "BILL-4021");

    expect(view).toMatchObject({ number: 4951, merged: true });
  });

  it("prefers the open one over a merged one", async () => {
    const { host } = searchingHost(
      { "is:open": [hit(4960, "BILL-4021: rework")], "is:merged": [hit(4951, "BILL-4021: first")] },
      { 4960: {}, 4951: { merged: true } },
    );

    await expect(host.findPullRequestMentioning("Northwind/northwind-backend", "BILL-4021")).resolves.toMatchObject({ number: 4960 });
  });

  it("does not answer for an id that only shares a prefix", async () => {
    const { asked, host } = searchingHost({ "is:open": [hit(4970, "BILL-40210: something else")] }, { 4970: {} });

    await expect(host.findPullRequestMentioning("Northwind/northwind-backend", "BILL-4021")).resolves.toBeNull();
    expect(asked()).not.toContain("PullRequestByNumber");
  });
});

describe("GitHubCodeHost.authoredWithChangesRequested", () => {
  it("finds pull requests this login authored that somebody asked to change, in the repositories given", async () => {
    const { asked, host } = searchingHost(
      { "author:ada": [hit(4980, "BILL-4021: total"), hit(4981, "BILL-4022: since approved")] },
      { 4980: { reviewDecision: "CHANGES_REQUESTED" }, 4981: { reviewDecision: "APPROVED" } },
    );

    const found = await host.authoredWithChangesRequested("ada", ["Northwind/northwind-backend"]);

    expect(found.map((request) => request.number)).toEqual([4980]);
    expect(asked()).toContain("author:ada");
    expect(asked()).toContain("review:changes_requested");
    expect(asked()).toContain("is:open");
    expect(asked()).toContain("repo:Northwind/northwind-backend");
  });

  it("searches nothing when it was given no repository", async () => {
    const { asked, host } = searchingHost({}, {});

    await expect(host.authoredWithChangesRequested("ada", [])).resolves.toEqual([]);
    expect(asked()).toBe("");
  });
});

describe("GitHubCodeHost, the branch a pull request is opened from", () => {
  it("carries it, so a workflow that found the pull request by title pushes where it will see", async () => {
    const { host } = hostFor(REAL_RESPONSE);

    const view = await host.findPullRequest("Northwind/northwind-backend", "ada/proj-1241-link-table");

    expect(view?.headBranch).toBe("ada/proj-1241-link-table");
  });
});
