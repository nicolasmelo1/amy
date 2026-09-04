// The world amy is put to work in: two repositories, a tracker with three
// tickets in it, a code host with other people's reviews already open, and a
// roster nobody has confirmed yet.
//
// Everything here is a stand-in for a service, and nothing here is a stand-in
// for amy: the repositories are real git, the checkouts are real clones, the
// gate is a real shell command against a real file. What is faked is only
// what would otherwise need somebody's credentials.
//
// Nobody named in this file is real. The addresses are `.test` and
// `.example`, which is what those domains are reserved for.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** The ticket the run is about, and the two that must be left alone. */
export const TICKET = "BILL-4021";
export const PAST_IMPLEMENTATION = "BILL-4022";
export const SOMEBODY_ELSES = "BILL-4023";

export const BRANCH = "amy/bill-4021-show-the-currency-on-the-invoice-total";
export const REPO = "acme/widgets";
export const OTHER_REPO = "acme/gadgets";
export const BOT = "copilot-pull-request-reviewer[bot]";

const TEAM = {
  id: "team-billing",
  key: "BILL",
  name: "Billing",
  states: [
    { id: "s-progress", name: "In Progress" },
    { id: "s-review", name: "In Review" },
    { id: "s-qa", name: "In QA" },
    { id: "s-shipped", name: "Ready To Release" },
  ],
};

const VIEWER = { id: "u-amy", email: "amy@example.test" };

const USERS = [
  VIEWER,
  { id: "u-ada", email: "ada@example.test" },
  { id: "u-alan", email: "alan@example.test" },
  { id: "u-grace", email: "grace@example.test" },
  { id: "u-owner", email: "owner@example.test" },
];

function git(cwd, ...args) {
  // stderr captured rather than inherited: git says perfectly ordinary things
  // on it, and a scenario's output should be its own findings.
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** A bare repository with one commit on the default branch, and a clone of it. */
function repository(root, name) {
  const origin = path.join(root, "origins", `${name}.git`);
  const checkout = path.join(root, "checkouts", name);

  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin], { stdio: "ignore" });
  execFileSync("git", ["clone", origin, checkout], { stdio: "ignore" });

  git(checkout, "config", "user.name", "amy");
  git(checkout, "config", "user.email", "amy@example.test");
  git(checkout, "config", "commit.gpgsign", "false");

  fs.writeFileSync(
    path.join(checkout, "README.md"),
    `# ${name}\n\nBilling, the part of it that adds up.\n`,
    "utf-8",
  );
  git(checkout, "add", "-A");
  git(checkout, "commit", "-m", "the first commit");
  git(checkout, "push", "--quiet", "origin", "main");
}

/** The commit a branch points at in the repository itself. */
export function headOf(root, name, branch) {
  try {
    return git(root, "--git-dir", path.join(root, "origins", `${name}.git`), "rev-parse", `refs/heads/${branch}`);
  } catch {
    return "";
  }
}

/** Somebody else's pull request, sitting on a reviewer's pile. */
function openReview(number, head, reviewer) {
  return {
    number,
    title: head,
    body: "",
    head,
    base: "main",
    state: "open",
    isDraft: false,
    reviewDecision: "REVIEW_REQUIRED",
    requestedReviewers: [reviewer],
    reviews: [],
    threads: [],
  };
}

const TRACKER_STATE = {
  viewer: VIEWER,
  users: USERS,
  teams: [TEAM],
  nextIssueNumber: 4024,
  issues: [
    {
      id: "uuid-BILL-4021",
      identifier: TICKET,
      title: "Show the currency on the invoice total",
      url: `https://tracker.test/issue/${TICKET}`,
      branchName: BRANCH,
      stateId: "s-progress",
      teamId: TEAM.id,
      assigneeId: VIEWER.id,
      comments: [],
    },
    // In Review, which the tracker files under the same category as In
    // Progress. Picked up by a category match, and it must not be.
    {
      id: "uuid-BILL-4022",
      identifier: PAST_IMPLEMENTATION,
      title: "Round the tax line to the nearest cent",
      url: `https://tracker.test/issue/${PAST_IMPLEMENTATION}`,
      branchName: "amy/bill-4022-round-the-tax-line",
      stateId: "s-review",
      teamId: TEAM.id,
      assigneeId: VIEWER.id,
      comments: [],
    },
    // In Progress, and somebody else's.
    {
      id: "uuid-BILL-4023",
      identifier: SOMEBODY_ELSES,
      title: "Split the invoice by cost centre",
      url: `https://tracker.test/issue/${SOMEBODY_ELSES}`,
      branchName: "ada/bill-4023-split-by-cost-centre",
      stateId: "s-progress",
      teamId: TEAM.id,
      assigneeId: "u-ada",
      comments: [],
    },
  ],
};

const CODE_HOST_STATE = {
  defaultBranch: "main",
  nextNumber: 41,
  repos: {
    // Two apiece, which is the ceiling. Split across the two repositories on
    // purpose: counting either one alone picks the wrong person.
    [REPO]: {
      pulls: [
        openReview(11, "chore/bump-the-pdf-library", "ada"),
        openReview(12, "fix/the-vat-column-header", "ada"),
      ],
    },
    [OTHER_REPO]: {
      pulls: [openReview(21, "feat/bulk-export", "alan"), openReview(22, "chore/drop-node-20", "alan")],
    },
  },
};

const AGENT_SCRIPT = {
  file: "invoice.md",
  currency: "BRL",
  triage: {
    clear: false,
    questions: ["Which currency should the invoice total be shown in?"],
  },
  // The human's second comment is refused first and answered once the owner
  // has settled it, which is the path an escalation exists for.
  verdicts: { "BOT-1": ["fixed"], "HUM-1": ["fixed"], "HUM-2": ["disagreed", "fixed"] },
};

const ROSTER = `# Nobody has confirmed this yet, which is where every morning starts.
confirmedOn: "1970-01-01"

reviewers:
  - tracker: ada@example.test
    host: ada
    available: true
  - tracker: alan@example.test
    host: alan
    available: true

qa:
  tracker: grace@example.test
  host: grace
  available: true
`;

function config(root, endpoint) {
  return `repos:
  - ${REPO}
  - ${OTHER_REPO}

workingStatusName: In Progress
qaStatusName: In QA

# Zero, because the queue is the schedule and this run is driven a move at a
# time. In production these are the minutes a waiting state backs off for.
policy:
  maxOpenReviewsPerReviewer: 2
  pollBackoffMs: 0
  rosterBackoffMs: 0

workspaceRoot: ${path.join(root, "checkouts")}
defaultBranch: main

repoByTeam:
  BILL: ${REPO}

# A real gate: two shell commands, run in the checkout, and the second one
# fails until the work is actually right.
gate:
  ${REPO}:
    - test -f invoice.md
    - grep -q "currency:" invoice.md

agent:
  model: sonnet
  budget:
    perFiveHours: { tokens: 20000000, costUsd: 50 }
    perWeek: { tokens: 100000000, costUsd: 200 }
    stopAt: 0.9

notify:
  tracker: true
  hermes: null
  inbox: true

# The tracker's own slice, which is the only way the endpoint moves. Naming a
# slice replaces the derived one, so every setting the plugin declared is here.
plugins:
  "@amy/plugin-linear":
    workingStatusName: In Progress
    repoByTeam:
      BILL: ${REPO}
    defaultRepo: ${REPO}
    endpoint: ${endpoint}
`;
}

/**
 * Writes the world into a scratch directory: the services, the repositories,
 * and the working directory amy is run from.
 *
 * That working directory is deliberately not a repository. The machine works
 * on tickets that name real people, and a working directory that is a
 * checkout is one `git add -A` away from publishing them.
 *
 * What it does not write is the config and the roster. Those are `amy init`'s
 * to write, and this run edits them the way an operator would.
 */
export function build(root, { source }) {
  for (const dir of ["home", "origins", "checkouts", "world", "bin"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  repository(root, REPO.slice(REPO.indexOf("/") + 1));
  repository(root, OTHER_REPO.slice(OTHER_REPO.indexOf("/") + 1));

  const world = path.join(root, "world");
  write(path.join(world, "tracker.json"), TRACKER_STATE);
  write(path.join(world, "code-host.json"), CODE_HOST_STATE);
  write(path.join(world, "agent.json"), AGENT_SCRIPT);

  for (const tool of ["gh", "claude"]) {
    const installed = path.join(root, "bin", tool);
    fs.copyFileSync(path.join(source, "bin", tool), installed);
    fs.chmodSync(installed, 0o755);
  }

  // Read from the working directory, gitignored in the real one. Short and
  // obviously fake: a key shaped like a real one is a finding for a secret
  // scanner, and rightly so.
  fs.writeFileSync(path.join(root, "home", ".env"), "LINEAR_API_KEY=lin_api_standin\n", "utf-8");
}

/** The edit an operator makes to what `amy init` wrote, before confirming it. */
export function configure(root, endpoint) {
  const amyDir = path.join(root, "home", ".amy");
  fs.writeFileSync(path.join(amyDir, "config.yaml"), config(root, endpoint), "utf-8");
  fs.writeFileSync(path.join(amyDir, "roster.yaml"), ROSTER, "utf-8");
}

export function write(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Every line of a log the stand-ins append to, as objects. */
export function lines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
