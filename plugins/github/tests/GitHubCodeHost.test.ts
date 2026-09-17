import { describe, it, expect } from "vitest";
import { GitHubCodeHost } from "../src/GitHubCodeHost.js";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
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
            isDraft: false,
            reviewDecision: "CHANGES_REQUESTED",
            headRefOid: HEAD,
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
                // The shape that motivated this: the thread's author replied
                // to their own comment, so what the thread is waiting on is
                // not what it started with.
                {
                  id: "T_replied_bot",
                  isResolved: false,
                  isOutdated: false,
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
    const node = REAL_RESPONSE.data.repository.pullRequests.nodes[0];
    const { commits: _dropped, ...withoutCommits } = node as typeof node & { commits: unknown };
    const { host } = hostFor({
      data: { repository: { pullRequests: { nodes: [withoutCommits] } } },
    });

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
    expect(asked).not.toContain("headRefName");
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
    expect(argv).toContain("event=APPROVED");
    expect(argv).toContain("body=the mapping holds");
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
