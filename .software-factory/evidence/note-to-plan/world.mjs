// The world a note is turned into a plan in: two repositories that keep their
// plans the way this one does, a code host, and nothing else.
//
// There is deliberately no tracker in here. That is the claim: a piece of
// work reaches the queue, gets an agent spent on it and ends up on a pull
// request, and at no point does anything resolve it against an issue.
//
// Nobody named in this file is real, and the addresses are the ones RFC 2606
// reserves for exactly that.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const REPO = "acme/amy";
export const OTHER_REPO = "acme/software-factory";
/** A repository this install does not write plans into. */
export const FOREIGN_REPO = "acme/somewhere-else";

/** What an operator types, and what the machine has to make of it. */
export const FRICTION =
  "the relay retries a harness that already said it was out of quota";
export const BY_HAND = "the gate output is truncated before the agent ever sees it";

export const SLUG = "the-relay-retries-a-harness-that-already-said";
export const BY_HAND_SLUG = "the-gate-output-is-truncated-before-the-agent";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * A repository that keeps its plans the way this one does.
 *
 * The `plans/` directory and its ordered list are real files with real
 * contents, because the check the agent has to satisfy reads them. A fixture
 * that only pretended to have them would prove the script, not the bar.
 */
function repository(root, repo) {
  const name = repo.slice(repo.indexOf("/") + 1);
  const origin = path.join(root, "origins", `${name}.git`);
  const checkout = path.join(root, "checkouts", name);

  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin], { stdio: "ignore" });
  execFileSync("git", ["clone", origin, checkout], { stdio: "ignore" });

  git(checkout, "config", "user.name", "amy");
  git(checkout, "config", "user.email", "amy@example.test");
  git(checkout, "config", "commit.gpgsign", "false");

  fs.mkdirSync(path.join(checkout, "plans"), { recursive: true });
  fs.writeFileSync(
    path.join(checkout, "README.md"),
    `# ${name}\n\nWork is decided in \`plans/\`, in the order \`plans/next-steps.md\` gives.\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(checkout, "plans", "next-steps.md"),
    [
      "# Next steps",
      "",
      "The execution order. A plan not listed here is written, valid, and off",
      "the critical path.",
      "",
      "| # | Work | Exit condition |",
      "| --- | --- | --- |",
      "| 1 | [The first thing](the-first-thing.md) | It is done |",
      "",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(checkout, "plans", "the-first-thing.md"),
    [
      "# The first thing",
      "",
      "What a plan in this repository looks like.",
      "",
      "**Exit condition:** the first thing is done.",
      "",
    ].join("\n"),
    "utf-8",
  );

  git(checkout, "add", "-A");
  git(checkout, "commit", "-m", "the first commit");
  git(checkout, "push", "--quiet", "origin", "main");
}

const CODE_HOST_STATE = {
  defaultBranch: "main",
  nextNumber: 41,
  /** Where the code host is not answering, which is what a bad day looks like. */
  refuse: [OTHER_REPO],
  repos: { [REPO]: { pulls: [] }, [OTHER_REPO]: { pulls: [] } },
};

/**
 * What the stand-in agent does, and it is deliberately not enough the first
 * time.
 *
 * A plan with no exit condition and no line in the ordered list is what the
 * repository's own check refuses, and that refusal has to come from the file
 * genuinely being wrong rather than from a script deciding to say no.
 */
const AGENT_SCRIPT = { attempts: {} };

function config(root) {
  return `# There is no tracker in this run, and no ticket workflow settings that
# would need one. What is here is the second workflow's own vocabulary.
repos: []
workspaceRoot: ${path.join(root, "checkouts")}
defaultBranch: main

# One attempt, so a code host that is not answering costs one look rather
# than five. In production this is five.
maxItemAttempts: 1

plans:
  repos:
    - ${REPO}
    - ${OTHER_REPO}
  check:
    default:
      - sf check
  policy:
    # One, so a second note arriving while the first is still in flight meets
    # the ceiling rather than sailing past it.
    maxOpenPlansPerRepo: 1
    # Zero, because the queue is the schedule and this run is driven a move at
    # a time. In production this is an hour.
    ceilingBackoffMs: 0
    maxDraftAttempts: 3

agent:
  model: sonnet
  budget:
    perFiveHours: { tokens: 20000000, costUsd: 50 }
    perWeek: { tokens: 100000000, costUsd: 200 }
    stopAt: 0.9

notify:
  tracker: false
  hermes: null
  inbox: true
`;
}

/** Writes the world into a scratch directory. */
export function build(root, { source }) {
  for (const dir of ["home", "origins", "checkouts", "world", "bin"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  repository(root, REPO);
  repository(root, OTHER_REPO);

  const world = path.join(root, "world");
  write(path.join(world, "code-host.json"), CODE_HOST_STATE);
  write(path.join(world, "agent.json"), AGENT_SCRIPT);

  for (const tool of ["gh", "claude", "sf"]) {
    const installed = path.join(root, "bin", tool);
    fs.copyFileSync(path.join(source, "bin", tool), installed);
    fs.chmodSync(installed, 0o755);
  }
}

/** The edit an operator makes to what `amy init` wrote. */
export function configure(root) {
  fs.writeFileSync(path.join(root, "home", ".amy", "config.yaml"), config(root), "utf-8");
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

/** What is on a branch in the repository itself, if anything. */
export function fileOnBranch(root, repo, branch, file) {
  const name = repo.slice(repo.indexOf("/") + 1);
  try {
    return execFileSync(
      "git",
      ["--git-dir", path.join(root, "origins", `${name}.git`), "show", `${branch}:${file}`],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return "";
  }
}
