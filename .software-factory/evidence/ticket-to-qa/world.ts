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
export const TICKET_TWO = "BILL-4024";
export const PAST_IMPLEMENTATION = "BILL-4022";
export const SOMEBODY_ELSES = "BILL-4023";
/** The shared Linear parent that anchors this ticket's operator-authored brief. */
export const BRIEF = "uuid-BILL-brief-4020";

export const BRANCH = "amy/bill-4021-show-the-currency-on-the-invoice-total";
export const SECOND_BRANCH = "amy/bill-4024-show-the-currency-on-the-refund-total";
export const REPO = "acme/widgets";
export const OTHER_REPO = "acme/gadgets";
/** The third ticket, and the repository that names its own root. */
export const TICKET_THREE = "OPS-4025";
export const THIRD_BRANCH = "amy/ops-4025-show-the-currency-on-the-credit-note";
export const BOT = "copilot-pull-request-reviewer[bot]";

/** The tracker's state file, which the stand-in tracker serves and the run edits. */
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Team {
  id: string;
  key: string;
  name: string;
  states: { id: string; name: string }[];
}

export interface Comment {
  body: string;
  createdAt: string;
  userId: string;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  branchName: string;
  parentId?: string;
  stateId: string;
  teamId: string;
  assigneeId: string;
  description?: string;
  priority?: number;
  labels?: string[];
  comments: Comment[];
}

export interface TrackerState {
  viewer: User;
  users: User[];
  teams: Team[];
  nextIssueNumber: number;
  issues: Issue[];
}

/** The code host's state file, which the stand-in `gh` serves and the run edits. */
export interface Review {
  author: string;
  state: string;
  commitSha: string;
  submittedAt: string;
}

export interface Thread {
  id: string;
  author: string;
  body: string;
  isResolved: boolean;
  isOutdated: boolean;
}

export interface Pull {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  state: string;
  isDraft: boolean;
  reviewDecision: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  mergeable: string;
  mergeStateStatus: string;
  checks: string;
  requestedReviewers: string[];
  reviews: Review[];
  threads: Thread[];
}

export interface CodeHost {
  defaultBranch: string;
  nextNumber: number;
  repos: Record<string, { pulls: Pull[] }>;
}

/** An operator's brief, as amy keeps it on disk. */
export interface Brief {
  id: string;
  sections: { name: string; body: string }[];
  questions?: { workId: string; question: string }[];
  explains: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}

const TEAM: Team = {
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

// A second team, whose tickets land in the repository that names its own
// root: the whole claim this run makes about checkouts is that work in two
// repositories under two unrelated parents is ordinary.
const SUPPORT: Team = {
  id: "team-support",
  key: "OPS",
  name: "Support",
  states: [
    { id: "s-progress", name: "In Progress" },
    { id: "s-review", name: "In Review" },
    { id: "s-qa", name: "In QA" },
    { id: "s-shipped", name: "Ready To Release" },
  ],
};

const VIEWER: User = { id: "u-amy", email: "amy@example.test", name: "amy" };

const USERS: User[] = [
  VIEWER,
  { id: "u-ada", email: "ada@example.test", name: "Ada Lovelace" },
  { id: "u-alan", email: "alan@example.test", name: "Alan Turing" },
  { id: "u-grace", email: "grace@example.test", name: "Grace Hopper" },
  { id: "u-owner", email: "owner@example.test", name: "Ticket Owner" },
];

function git(cwd: string, ...args: string[]): string {
  // stderr captured rather than inherited: git says perfectly ordinary things
  // on it, and a scenario's output should be its own findings.
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** A bare repository with one commit on the default branch, and a clone of it. */
function repository(root: string, name: string): void {
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
export function headOf(root: string, name: string, branch: string): string {
  try {
    return git(root, "--git-dir", path.join(root, "origins", `${name}.git`), "rev-parse", `refs/heads/${branch}`);
  } catch {
    return "";
  }
}

/** Somebody else's pull request, sitting on a reviewer's pile. */
function openReview(number: number, head: string, reviewer: string): Pull {
  return {
    number,
    title: head,
    body: "",
    head,
    base: "main",
    state: "open",
    isDraft: false,
    reviewDecision: "REVIEW_REQUIRED",
    // What the forge knows about the branch, in the shape the real one sends
    // it. Small, green and clean, so the walk is about the lifecycle and a
    // run that means to be about a broken branch has to say so.
    changedFiles: 3,
    additions: 40,
    deletions: 12,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    checks: "SUCCESS",
    requestedReviewers: [reviewer],
    reviews: [],
    threads: [],
  };
}

const TRACKER_STATE: TrackerState = {
  viewer: VIEWER,
  users: USERS,
  teams: [TEAM, SUPPORT],
  nextIssueNumber: 4026,
  issues: [
    {
      id: "uuid-BILL-4021",
      identifier: TICKET,
      title: "Show the currency on the invoice total",
      url: `https://tracker.test/issue/${TICKET}`,
      branchName: BRANCH,
      parentId: BRIEF,
      stateId: "s-progress",
      teamId: TEAM.id,
      assigneeId: VIEWER.id,
      // An instruction the title does not carry, and the shape of the whole
      // claim this proves: only the tracker could have delivered it, so a
      // prompt carrying it is a trip that worked end to end.
      description:
        "The total line must show the same currency as the rest of the invoice. Do not round here.",
      labels: ["Bug"],
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

const CODE_HOST_STATE: CodeHost = {
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

// The second repository's own script: the same shape of work, in its own
// file, with the same currency. The gate for this repository reads it, which
// is what ties the named checkout to a real effect on the disk.
const AGENT_GADGETS_SCRIPT = {
  file: "credit-note.md",
  currency: "BRL",
  triage: {
    clear: false,
    questions: ["Which currency should the credit note total be shown in?"],
  },
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

/** Which engine drives the run: the default one, or the one that moves lanes side by side. */
export type EngineChoice = "serial" | "concurrent";

/**
 * The plugins a profile mounts when it names the concurrent engine: the same
 * list the serial one is recommended with, the engine swapped.
 */
const CONCURRENT_PLUGINS = [
  "@amykit/plugin-file-queue",
  "@amykit/plugin-file-store",
  "@amykit/plugin-file-brief-store",
  "@amykit/plugin-file-notes",
  "@amykit/plugin-github",
  "@amykit/plugin-linear",
  "@amykit/workflow-ticket-to-qa",
  "@amykit/plugin-file-worktree",
  "@amykit/plugin-claude",
  "@amykit/plugin-codex",
  "@amykit/plugin-hermes-agent",
  "@amykit/plugin-agent-relay",
  "@amykit/plugin-notify-fanout",
  "@amykit/plugin-notify-inbox",
  "@amykit/plugin-concurrent-engine",
  "@amykit/plugin-command-gate",
];

function config(root: string, endpoint: string, engine: EngineChoice): string {
  const plugins = engine === "concurrent"
    ? `\n    plugins:\n${CONCURRENT_PLUGINS.map((name) => `      - "${name}"`).join("\n")}`
    : "";
  return `# The workflow is named, not shipped: a machine drives nothing until the
# config declares one, so this run names the one it is driving.
workflows:
  tickets:
    workflow: "@amykit/workflow-ticket-to-qa"${plugins}
defaultWorkflow: tickets

# Package updates have their own installed scenario. This one drives more
# than twenty single-move invocations and must not turn its twentieth move
# into a registry call unrelated to the lifecycle under proof.
autoUpdate:
  enabled: false

repos:
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
# One repository names its own root: the checkout is under a parent nothing
# else in this config shares, which is the claim — no symlink, and nothing
# under the root that is not state.
checkouts:
  ${OTHER_REPO}: ${path.join(root, "elsewhere", "gadgets")}
defaultBranch: main
worktrees:
  root: ${path.join(root, "worktrees")}
  retentionDays: 0

repoByTeam:
  BILL: ${REPO}
  OPS: ${OTHER_REPO}

# A real gate: two shell commands, run in the checkout, and the second one
# fails until the work is actually right. The first writes down which tree
# it ran in and at which commit, which is what the lanes are held to.
gate:
  ${REPO}:
    - echo "$(pwd) $(git rev-parse HEAD)" >> "$AMY_E2E_WORLD/gate-heads.log"
    - test -f invoice.md
    - grep -q "currency:" invoice.md
  ${OTHER_REPO}:
    - test -f credit-note.md
    - grep -q "currency:" credit-note.md

agent:
  model: sonnet
  budget:
    perFiveHours: { tokens: 20000000, costUsd: 50 }
    perWeek: { tokens: 100000000, costUsd: 200 }
    stopAt: 0.9

# The question the machine asks the person, and what they answered on the
# ticket. The comment amy leaves is the first, quoted in the prompt as its own;
# the answer is what the re-read carries to the agent.
notify:
  hermes: null
  inbox: true

# The tracker's own slice, which is the only way the endpoint moves. Naming a
# slice replaces the derived one, so every setting the plugin declared is here.
plugins:
  "@amykit/plugin-linear":
    workingStatusName: In Progress
    repoByTeam:
      BILL: ${REPO}
      OPS: ${OTHER_REPO}
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
export function build(root: string, { source }: { source: string }): void {
  for (const dir of ["home", "origins", "checkouts", "world", "bin", "elsewhere"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  repository(root, REPO.slice(REPO.indexOf("/") + 1));
  repository(root, OTHER_REPO.slice(OTHER_REPO.indexOf("/") + 1));

  // The checkout that names its own root: a real clone of the second
  // repository, under a parent no other entry shares. The standing checkout
  // under checkouts/gadgets is still there and still ignored for it.
  const named = path.join(root, "elsewhere", "gadgets");
  execFileSync("git", ["clone", "-q", path.join(root, "origins", "gadgets.git"), named], {
    stdio: "ignore",
  });
  git(named, "config", "user.name", "amy");
  git(named, "config", "user.email", "amy@example.test");
  git(named, "config", "commit.gpgsign", "false");

  const world = path.join(root, "world");
  write(path.join(world, "tracker.json"), TRACKER_STATE);
  write(path.join(world, "code-host.json"), CODE_HOST_STATE);
  write(path.join(world, "agent.json"), AGENT_SCRIPT);
  write(path.join(world, "agent-gadgets.json"), AGENT_GADGETS_SCRIPT);

  // Each stand-in is a wrapper and the TypeScript it runs, side by side.
  for (const tool of ["gh", "claude"]) {
    const installed = path.join(root, "bin", tool);
    fs.copyFileSync(path.join(source, "bin", tool), installed);
    fs.copyFileSync(path.join(source, "bin", `${tool}.ts`), `${installed}.ts`);
    fs.chmodSync(installed, 0o755);
  }

  // Read from the working directory, gitignored in the real one. Short and
  // obviously fake: a key shaped like a real one is a finding for a secret
  // scanner, and rightly so.
  fs.writeFileSync(path.join(root, "home", ".env"), "LINEAR_API_KEY=lin_api_standin\n", "utf-8");
}

/** The edit an operator makes to what `amy init` wrote, before confirming it. */
export function configure(root: string, endpoint: string, engine: EngineChoice = "serial"): void {
  const amyDir = path.join(root, "home", ".amy");
  fs.writeFileSync(path.join(amyDir, "config.yaml"), config(root, endpoint, engine), "utf-8");
  fs.writeFileSync(path.join(amyDir, "roster.yaml"), ROSTER, "utf-8");
  // An operator's brief is durable state, not a prompt fixture. The child
  // ticket names this exact parent id through the tracker on each observation.
  fs.mkdirSync(path.join(amyDir, "briefs"), { recursive: true });
  write<Brief>(path.join(amyDir, "briefs", `${BRIEF}.json`), {
    id: BRIEF,
    sections: [{ name: "Constraint", body: "Keep the currency beside the total; do not round it." }],
    questions: [],
    explains: [TICKET],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    revision: 1,
  });
}

export function write<T>(file: string, value: T): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

/** What a state file or a request has to hold, or whatever asked for it fails. */
export function found<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new Error(`there is no ${what}`);
  return value;
}

/** Every line of a log the stand-ins append to, as objects. */
export function lines<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
