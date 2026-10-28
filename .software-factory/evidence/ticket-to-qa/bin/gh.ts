// The stand-in code host: `gh`, as much of it as amy calls.
//
// It is a CLI on the PATH rather than an injected object, so what is proved
// is the real argv the adapter builds and the real parsing of what comes
// back. Every invocation is logged, which is how the scenario can assert that
// no pull request was opened before the gate went green — an ordering no
// return value shows.
//
// The head sha is read from the real repository rather than invented. That is
// the whole reason a stale review is visible at all: a review is submitted
// against a commit, and pushing a fix moves the head out from under it.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** The code host as this stand-in keeps it in `code-host.json`. */
interface Review {
  author: string;
  state: string;
  commitSha: string;
  submittedAt: string;
}

interface Thread {
  id: string;
  author: string;
  body: string;
  path?: string;
  isResolved: boolean;
  isOutdated: boolean;
}

interface Pull {
  number: number;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  author?: string;
  state: string;
  merged?: boolean;
  isDraft: boolean;
  reviewDecision: string | null;
  changedFiles: number;
  additions: number;
  deletions: number;
  mergeable: string;
  mergeStateStatus: string;
  checks: string | null;
  requestedReviewers: string[];
  reviews: Review[];
  threads: Thread[];
}

interface CodeHost {
  defaultBranch: string;
  nextNumber: number;
  repos: Record<string, { pulls: Pull[] }>;
  statuses?: Record<string, { state: string }[]>;
}

const world = process.env.AMY_E2E_WORLD;
if (!world) {
  process.stderr.write("AMY_E2E_WORLD names no world for this stand-in\n");
  process.exit(1);
}
const origins = process.env.AMY_E2E_ORIGINS ?? "";
const stateFile = path.join(world, "code-host.json");

const argv = process.argv.slice(2);
fs.appendFileSync(
  path.join(world, "gh.log"),
  `${JSON.stringify({ at: new Date().toISOString(), argv })}\n`,
);

const read = (): CodeHost => JSON.parse(fs.readFileSync(stateFile, "utf-8")) as CodeHost;
const write = (state: CodeHost): void => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");

/** `-f name=value` and `-F name=value`, as gh takes them. */
function fields(args: string[]): Record<string, string | undefined> {
  const found: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "-f" && args[index] !== "-F") continue;
    const pair = args[index + 1] ?? "";
    const split = pair.indexOf("=");
    found[pair.slice(0, split)] = pair.slice(split + 1);
  }
  return found;
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** The commit the branch actually points at, from the repository itself. */
function headOf(repo: string, branch: string | undefined): string {
  const gitDir = path.join(origins, `${repo.slice(repo.indexOf("/") + 1)}.git`);
  try {
    return execFileSync("git", ["--git-dir", gitDir, "rev-parse", `refs/heads/${branch}`], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function pullsIn(state: CodeHost, repo: string): Pull[] {
  const entry = state.repos[repo];
  if (!entry) fail(`no repository called ${repo}`);
  return entry.pulls;
}

/** A pull request in the shape the GraphQL query asks for. */
function pullRequestNode(repo: string, pull: Pull): unknown {
  return {
    number: pull.number,
    isDraft: pull.isDraft,
    reviewDecision: pull.reviewDecision,
    headRefOid: headOf(repo, pull.head),
    headRefName: pull.head,
    changedFiles: pull.changedFiles,
    additions: pull.additions,
    deletions: pull.deletions,
    merged: pull.merged ?? false,
    baseRefName: pull.base ?? "main",
    mergeable: pull.mergeable,
    mergeStateStatus: pull.mergeStateStatus,
    commits: {
      nodes: [
        {
          commit: {
            oid: headOf(repo, pull.head),
            statusCheckRollup: pull.checks === null ? null : { state: pull.checks },
          },
        },
      ],
    },
    reviewRequests: {
      nodes: pull.requestedReviewers.map((login) => ({
        requestedReviewer: { __typename: "User", login },
      })),
    },
    reviews: {
      nodes: pull.reviews.map((review) => ({
        author: { login: review.author },
        state: review.state,
        submittedAt: review.submittedAt,
        commit: { oid: review.commitSha },
      })),
    },
    reviewThreads: {
      nodes: pull.threads.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        path: thread.path ?? "src/index.ts",
        comments: { nodes: [{ author: { login: thread.author }, body: thread.body }] },
      })),
    },
  };
}

function graphql(state: CodeHost, args: string[]): unknown {
  // A thread mutation names itself: the adapter's query carries
  // `resolveReviewThread(input: {threadId: $id})` or its unresolve twin, and
  // the stand-in answers with the thread the id names.
  const mutation = /mutation Thread\(\$id: ID!\)\s*{\s*(resolve|unresolve)ReviewThread/.exec(
    args.join(" "),
  );
  if (mutation) {
    const id = fields(args).id;
    const resolved = mutation[1] === "resolve";
    const everyPull = Object.values(state.repos)
      .map((entry) => entry.pulls)
      .flat(1);
    const pull = everyPull.find((candidate) => candidate.threads.some((thread) => thread.id === id));
    if (!pull) fail(`no review thread called ${id} on any open pull request`);

    pull.threads = pull.threads.map((thread) =>
      thread.id === id ? { ...thread, isResolved: resolved } : thread,
    );
    write(state);

    // An object, like the query branch below: `api` stringifies whatever
    // this returns once, and a branch that pre-stringifies answers the
    // adapter with JSON inside JSON — no data, and a mutation that never
    // happened as far as the caller can tell.
    return {
      data: { [`${resolved ? "" : "un"}resolveReviewThread`]: { thread: { id, isResolved: resolved } } },
    };
  }

  // A search, in the slice of GitHub's grammar the adapter speaks: state,
  // repositories, words in the title, author and review state.
  if (/search\(query: \$search/.test(args.join(" "))) {
    return { data: { search: { nodes: search(state, fields(args).search ?? "") } } };
  }

  // A pull request read by number, merged or not: the branch the adapter's
  // by-branch search keeps for itself does not belong here, and the
  // fragment this query shares is what the node answers with.
  const byNumber = /pullRequest\(number: \$number\)/.test(args.join(" "));
  const fieldsGiven = fields(args);
  const repoName = `${fieldsGiven.owner}/${fieldsGiven.name}`;
  if (byNumber) {
    const number = Number(fieldsGiven.number);
    const found = pullsIn(state, repoName).find((pull) => pull.number === number);
    return {
      data: { repository: { pullRequest: found ? pullRequestNode(repoName, found) : null } },
    };
  }

  const open = pullsIn(state, repoName).filter(
    (pull) => pull.state === "open" && pull.head === fieldsGiven.branch,
  );

  return {
    data: {
      repository: {
        pullRequests: { nodes: open.slice(0, 1).map((pull) => pullRequestNode(repoName, pull)) },
      },
    },
  };
}

function search(state: CodeHost, query: string): unknown[] {
  const words: string[] = query.match(/"[^"]*"|\S+/g) ?? [];
  const value = (prefix: string): string[] => words.filter((word) => word.startsWith(prefix)).map((word) => word.slice(prefix.length));
  const repos = value("repo:");
  const title = words.find((word, index) => word.startsWith('"') && words[index - 1] === "in:title")?.replaceAll('"', "") ??
    words.filter((word) => word.startsWith('"')).map((word) => word.replaceAll('"', ""))[0];
  const [author] = value("author:");
  const [requested] = value("review-requested:");
  const [reviewedBy] = value("reviewed-by:");

  return Object.entries(state.repos)
    .filter(([repo]) => repos.length === 0 || repos.includes(repo))
    .flatMap(([repo, entry]) => entry.pulls.map((pull) => ({ repo, pull })))
    .filter(({ pull }) => !words.includes("is:open") || pull.state === "open")
    .filter(({ pull }) => !words.includes("is:merged") || pull.merged === true)
    .filter(({ pull }) => !words.includes("in:title") || (pull.title ?? "").toLowerCase().includes((title ?? "").toLowerCase()))
    .filter(({ pull }) => !author || (pull.author ?? "amy") === author)
    .filter(({ pull }) => !words.includes("review:changes_requested") || pull.reviewDecision === "CHANGES_REQUESTED")
    .filter(({ pull }) => !requested || pull.requestedReviewers.includes(requested))
    .filter(({ pull }) => !reviewedBy || pull.reviews.some((review) => review.author === reviewedBy))
    .map(({ repo, pull }) => ({
      number: pull.number,
      title: pull.title ?? "",
      url: `https://code.test/${repo}/pull/${pull.number}`,
      headRefOid: headOf(repo, pull.head),
      author: { login: pull.author ?? "amy" },
      repository: { nameWithOwner: repo },
    }));
}

/**
 * The combined status of one commit, as the REST endpoint answers it: in
 * lower case, which is the case the real one uses and the one an adapter
 * once failed to read.
 */
function combinedStatus(state: CodeHost, endpoint: string): unknown {
  const sha = /\/commits\/([^/]+)\/status$/.exec(endpoint)?.[1] ?? "";
  const statuses = (state.statuses ?? {})[sha] ?? [];
  const states = statuses.map((status) => status.state);
  const combined = states.length === 0 ? "pending" : states.includes("failure") || states.includes("error") ? "failure" : states.every((s) => s === "success") ? "success" : "pending";
  return { state: combined, sha, total_count: statuses.length, statuses };
}

function openPullRequest(state: CodeHost, repoPath: string, args: string[]): unknown {
  const repo = repoPath.replace(/^\/repos\//, "").replace(/\/pulls$/, "");
  const { title, head, base, body } = fields(args);
  const number = state.nextNumber;
  state.nextNumber += 1;

  pullsIn(state, repo).push({
    number,
    title,
    body,
    head,
    base,
    state: "open",
    isDraft: false,
    reviewDecision: null,
    changedFiles: 3,
    additions: 40,
    deletions: 12,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    checks: "SUCCESS",
    requestedReviewers: [],
    reviews: [],
    threads: [],
  });
  write(state);

  return { number, html_url: `https://code.test/${repo}/pull/${number}` };
}

function requestReview(state: CodeHost, repoPath: string, args: string[]): unknown {
  const match = /^\/repos\/(?<repo>[^/]+\/[^/]+)\/pulls\/(?<number>\d+)\/requested_reviewers$/.exec(
    repoPath,
  );
  if (!match) fail(`not a review request path: ${repoPath}`);
  const repo = match.groups?.repo ?? "";
  const number = match.groups?.number ?? "";

  const pull = pullsIn(state, repo).find(
    (candidate) => candidate.number === Number(number),
  );
  if (!pull) fail(`${repo} has no pull request #${number}`);

  const who = fields(args)["reviewers[]"];
  if (who !== undefined && !pull.requestedReviewers.includes(who)) pull.requestedReviewers.push(who);
  write(state);

  return { number: pull.number, requested_reviewers: pull.requestedReviewers.map((login) => ({ login })) };
}

function api(state: CodeHost, args: string[]): string {
  if (args[0] === "graphql") return JSON.stringify(graphql(state, args));

  const method = flag(args, "--method") ?? "GET";
  const endpoint = args.find((arg) => arg.startsWith("/repos/"));
  if (!endpoint) fail(`no endpoint in: gh api ${args.join(" ")}`);

  if (method === "GET" && /\/commits\/[^/]+\/status$/.test(endpoint)) {
    return JSON.stringify(combinedStatus(state, endpoint));
  }

  if (method === "GET") {
    // `--jq .default_branch` returns the bare value, not an object, which is
    // what the adapter reads straight into a branch name.
    if (flag(args, "--jq") === ".default_branch") return state.defaultBranch;
    return JSON.stringify({ default_branch: state.defaultBranch });
  }

  if (endpoint.endsWith("/pulls")) return JSON.stringify(openPullRequest(state, endpoint, args));
  if (endpoint.endsWith("/requested_reviewers")) {
    return JSON.stringify(requestReview(state, endpoint, args));
  }

  fail(`no stand-in for: gh api --method ${method} ${endpoint}`);
}

/** `gh pr list --json number,reviewRequests`, per repository. */
function prList(state: CodeHost, args: string[]): string {
  const repo = flag(args, "--repo") ?? "";
  return JSON.stringify(
    pullsIn(state, repo)
      .filter((pull) => pull.state === "open")
      .map((pull) => ({
        number: pull.number,
        reviewRequests: pull.requestedReviewers.map((login) => ({ login })),
      })),
  );
}

const state = read();

if (argv[0] === "auth" && argv[1] === "status") {
  process.stdout.write("Logged in to code.test account amy\n");
} else if (argv[0] === "api") {
  process.stdout.write(`${api(state, argv.slice(1))}\n`);
} else if (argv[0] === "pr" && argv[1] === "list") {
  process.stdout.write(`${prList(state, argv.slice(2))}\n`);
} else {
  fail(`no stand-in for: gh ${argv.join(" ")}`);
}
