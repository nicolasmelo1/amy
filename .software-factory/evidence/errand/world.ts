// The world an errand is run in: one repository, a code host, and nothing
// else. Every errand in it is something somebody said in passing.
//
// There is no tracker in here, and that is the claim rather than a
// convenience: an errand is work nobody opened a ticket for, so the run has
// no ticket to resolve anything against even if the machine wanted one.
//
// Nobody named in this file is real, and the addresses are the ones RFC 2606
// reserves for exactly that.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** The one repository this install does errands in. */
export const REPO = "acme/amy";
/** A repository it does not: an errand about it is handed back, not retried. */
export const FOREIGN_REPO = "acme/somewhere-else";

/** What an operator types, and what the machine has to make of it. */
export const CHANGE_TASK = "bump the stale dependencies in the api package";
export const QUESTION_TASK = "check whether the nightly sync still runs against the old bucket";
export const REFUSE_TASK = "rewrite the billing ledger from scratch";
export const FOREIGN_TASK = "rotate the certificates in the old cluster";
/**
 * An errand whose agent commits its own work.
 *
 * The tree is clean when the workflow goes to commit, which is the case that
 * says whether "the push published a branch" was ever a fair test for "there
 * is something to review": the commit exists whether or not the working tree
 * has a diff in it any more.
 */
export const COMMITTED_TASK = "add a changelog entry for the api package";
/**
 * An errand that changes something, in a repository whose code host answers
 * that it takes no pull request for it: the pull-request workflow `PR_OPEN`
 * calls returns `REFUSED`, and the errand is handed back with the host's
 * own words.
 */
export const CLOSED_TASK = "tidy the readme of the api package";
export const REFUSED_BY_HOST = "Pull request creation is disabled for this repository";

/** The branch each task is carried on, derived the way the workflow derives it. */
export const CHANGE_BRANCH = "amy/errand-bump-the-stale-dependencies-in-the";
export const QUESTION_BRANCH = "amy/errand-check-whether-the-nightly-sync-still";
export const COMMITTED_BRANCH = "amy/errand-add-a-changelog-entry-for-the";

/** The id the hand-written task gets, because a file is named by its id. */
export const BY_HAND_ID = "by-hand-question";
/** The id the command-written task gets, read back off the directory. */
export const BY_HAND_SOURCE = "a hook";
export const BY_HAND_ADDED_AT = "2026-09-05T09:00:00.000Z";

/** The reason the agent gives on its refusal line, which is what the operator must see. */
export const REFUSAL = "rewriting the ledger needs a decision nobody made";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * A repository the way this team works in one.
 *
 * `api/package.json` is a real file with a real dependency in it, because the
 * change the agent makes has to be a change in a repository rather than a
 * flag somebody set: the commit, the push and the branch the pull request is
 * opened on are all real and all read back from the origin.
 */
function repository(root: string, repo: string): void {
  const name = repo.slice(repo.indexOf("/") + 1);
  const origin = path.join(root, "origins", `${name}.git`);
  const checkout = path.join(root, "checkouts", name);

  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin], { stdio: "ignore" });
  execFileSync("git", ["clone", origin, checkout], { stdio: "ignore" });

  git(checkout, "config", "user.name", "amy");
  git(checkout, "config", "user.email", "amy@example.test");
  git(checkout, "config", "commit.gpgsign", "false");

  fs.mkdirSync(path.join(checkout, "api"), { recursive: true });
  fs.writeFileSync(
    path.join(checkout, "README.md"),
    `# ${name}\n\nOne repository this install does errands in.\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(checkout, "api", "package.json"),
    `${JSON.stringify(
      {
        name: "api",
        version: "1.0.0",
        private: true,
        dependencies: { "left-pad": "1.0.0" },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  git(checkout, "add", "-A");
  git(checkout, "commit", "-m", "the first commit");
  git(checkout, "push", "--quiet", "origin", "main");
}

/** A pull request as the stand-in code host keeps it. */
export interface Pull {
  number: number;
  title: string | undefined;
  body: string | undefined;
  head: string | undefined;
  base: string | undefined;
  draft: boolean;
  state: string;
}

export interface CodeHost {
  defaultBranch: string;
  nextNumber: number;
  /** Titles the code host answers it will not open a pull request for. */
  decline: string[];
  repos: Record<string, { pulls: Pull[] }>;
}

const CODE_HOST_STATE: CodeHost = {
  defaultBranch: "main",
  // Not 1, so the number the announcement carries cannot be the first one
  // anything would guess.
  nextNumber: 41,
  decline: [CLOSED_TASK],
  repos: { [REPO]: { pulls: [] } },
};

/**
 * The agent's memory between calls, and it is deliberately empty.
 *
 * Nothing here scripts a *decision*: the stand-in reads the prompt it was
 * handed and answers it. What it remembers is how many times it has been
 * asked about one sentence, which is what makes a re-ask visible rather than
 * identical to the first ask.
 */
interface AgentScript {
  asked: Record<string, number>;
}

const AGENT_SCRIPT: AgentScript = { asked: {} };

function config(root: string): string {
  return `# One workflow drives this machine: something said in passing. The
# second profile exists only to have state of its own, which the run shows
# this one does not touch.
workflows:
  errand:
    workflow: "@amykit/workflow-errand"
    tasks: true
  ledger:
    workflow: "@amykit/workflow-errand"
defaultWorkflow: errand

repos:
  - ${REPO}
workspaceRoot: ${path.join(root, "checkouts")}
defaultBranch: main

# Outside the state directory on purpose: the run asserts the agent worked in
# a checkout of the repository and not in the directory the machine keeps its
# own files in, and a tree under \`~/.amy\` would make that sentence false for
# a reason that has nothing to do with the errand.
worktrees:
  root: ${path.join(root, "trees")}
  retentionDays: 7

# One, because no look in this run should throw: a defect that made one
# throw fails the run at once rather than hiding behind a retry. In
# production this is two.
maxItemAttempts: 1

# Off, because nothing in this run reaches the internet, and an update check
# every twentieth command would ask the real registry.
autoUpdate:
  enabled: false

# Two attempts, as in production, so a refusal that ends on the first is the
# agent's decision and not a ceiling the work ran into.
errands:
  policy:
    maxAttempts: 2
    maxInFlight: 3
    # Zero, because the queue is the schedule and this run is driven a move at
    # a time. In production this is half an hour.
    ceilingBackoffMs: 0

# One rung: the stand-in \`claude\` is the only harness on this PATH, and a
# ladder that named a second one would spend the run discovering that.
agent:
  model: sonnet
  ladder:
    - claude:sonnet

notify:
  tracker: false
  hermes: null
  inbox: true
`;
}

/** Writes the world into a scratch directory. */
export function build(root: string, { source }: { source: string }): void {
  for (const dir of ["home", "origins", "checkouts", "world", "bin"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  repository(root, REPO);

  const world = path.join(root, "world");
  write(path.join(world, "code-host.json"), CODE_HOST_STATE);
  write(path.join(world, "agent.json"), AGENT_SCRIPT);

  // Each stand-in is a wrapper and the TypeScript it runs, side by side.
  for (const tool of ["gh", "claude"]) {
    const installed = path.join(root, "bin", tool);
    fs.copyFileSync(path.join(source, "bin", tool), installed);
    fs.copyFileSync(path.join(source, "bin", `${tool}.ts`), `${installed}.ts`);
    fs.chmodSync(installed, 0o755);
  }
}

/** The edit an operator makes to what `amy init` wrote. */
export function configure(root: string): void {
  fs.writeFileSync(path.join(root, "home", ".amy", "config.yaml"), config(root), "utf-8");
}

export function write(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
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

/** What is on a branch in the repository itself, if anything. */
export function fileOnBranch(root: string, repo: string, branch: string, file: string): string {
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

/** Every branch name the origin holds, which is what a push is judged by. */
export function branches(root: string, repo: string): string[] {
  const name = repo.slice(repo.indexOf("/") + 1);
  return git(path.join(root, "origins", `${name}.git`), "for-each-ref", "--format=%(refname:short)", "refs/heads")
    .split("\n")
    .filter(Boolean);
}

/** Every file under a directory, with its contents, so a no-op can be shown. */
export function tree(directory: string): Record<string, string> {
  if (!fs.existsSync(directory)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(directory, { recursive: true, encoding: "utf-8" })
      .filter((name) => fs.statSync(path.join(directory, name)).isFile())
      .sort()
      .map((name) => [name, fs.readFileSync(path.join(directory, name), "utf-8")]),
  );
}
