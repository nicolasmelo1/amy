import fs from "node:fs";
import path from "node:path";
import { BranchLeases, LeaseHeld, STANDING_CHECKOUT, runningLane } from "./leases.js";
import { CommandRunner } from "./ports/CommandRunner.js";
import { Worktree } from "./ports/Worktree.js";

export interface RepoLayout {
  /** Directory that holds one checkout per repository. */
  workspaceRoot: string;
  /**
   * Where one repository's checkout is, instead of under the root.
   *
   * A repository named here is never looked for under `workspaceRoot` at all,
   * which is what makes the answer one fact rather than two guesses: work can
   * span repositories two unrelated parents hold, with no symlink holding the
   * map together and nothing in the state directory standing for config.
   */
  checkouts?: Readonly<Record<string, string>>;
  /** Branch new work is cut from. */
  defaultBranch: string;
  /**
   * Where one repository's base branch is, instead of the fallback.
   *
   * A repository named here is cut from, and opened against, its own branch;
   * every other keeps `defaultBranch`. The map is passed through whole rather
   * than resolved at the edge, because the slice is built once and the
   * repository is known per piece of work.
   */
  baseBranch?: Readonly<Record<string, string>>;
}

/**
 * The one base branch answer there is: a repository that named its own is
 * answered by that name, and every other keeps the fallback.
 *
 * Both halves of `RepoLayout` answer here, beside `checkoutFor`, so no caller
 * re-derives the rule and a second reader cannot drift from the first.
 */
export function baseBranchFor(layout: RepoLayout, repo: string): string {
  return layout.baseBranch?.[repo] ?? layout.defaultBranch;
}

/**
 * The one checkout answer there is: a repository that named its own root is
 * found there, and every other is found under the shared root.
 *
 * Both halves of `RepoLayout` answer here so no caller ever re-derives the
 * rule, and `amy doctor` asks the same function, so a missing checkout names
 * the root that was actually asked.
 */
export function checkoutFor(layout: RepoLayout, repo: string): string {
  const named = layout.checkouts?.[repo];
  if (named !== undefined) return named;
  const name = repo.includes("/") ? repo.slice(repo.indexOf("/") + 1) : repo;
  return path.join(layout.workspaceRoot, name);
}

/**
 * The git side of a ticket: get onto its branch, and get the work pushed.
 *
 * The branch name is always the one the tracker gave us, never derived here,
 * because the tracker owns the slug and links the pull request by it.
 *
 * One class answers both modes, and nothing about the mode is decided here:
 * when a worktree port was mounted, `pathFor` resolves through it and every
 * path hands out is the item's own tree; when none was, it resolves through
 * `workspaceRoot` exactly as it always did. A caller never changes shape.
 */
export class Git {
  /**
   * `worktrees` is the port itself, or how to read it when it is needed: the
   * host lends a reader, so a worktree plugin listed after the one holding
   * this `Git` is still the one every path resolves through.
   */
  constructor(
    private readonly runner: CommandRunner,
    private readonly layout: RepoLayout,
    private readonly worktreesOf?: Worktree | (() => Worktree | undefined),
    private readonly leases?: BranchLeases,
    private readonly lentTo?: (workId: string) => string | undefined,
  ) {}

  /**
   * The same checkouts, for a lane: a branch is taken before it is checked
   * out or pushed, and a branch another lane holds is a `LeaseHeld`, which
   * the lane waits on rather than fails. `lent` names the commit a lane was
   * lent, if any: that lane's tree is detached at it whatever it asks for,
   * and no move is made in it.
   */
  leasedTo(leases: BranchLeases, lent?: (workId: string) => string | undefined): Git {
    // Composed rather than replaced: a lane lent a commit that calls a
    // workflow with lanes of its own lends that commit to them too.
    const outer = this.lentTo;
    const lentTo = lent && outer ? (workId: string) => lent(workId) ?? outer(workId) : lent ?? outer;
    return new Git(this.runner, this.layout, this.worktreesOf, leases, lentTo);
  }

  private get worktrees(): Worktree | undefined {
    return typeof this.worktreesOf === "function" ? this.worktreesOf() : this.worktreesOf;
  }

  /**
   * Where the work for one repository happens.
   *
   * The mode question is answered once, here, rather than by every caller:
   * the agent steps, the gates and the workflow runtimes all read this, and
   * none of them learns whether this install isolates its checkouts.
   */
  pathFor(repo: string, workId?: string): string {
    const worktrees = this.worktrees;
    if (worktrees && workId !== undefined) {
      return worktrees.pathFor(workId, repo);
    }
    return checkoutFor(this.layout, repo);
  }

  /**
   * Makes the item's workplace before an agent is sent there.
   *
   * Triage is the first agent step and precedes branch preparation, so merely
   * computing `pathFor` would hand a harness a directory that does not exist.
   * The shared mode remains a no-op path lookup.
   */
  async acquire(repo: string, workId?: string): Promise<string> {
    const lent = workId === undefined ? undefined : this.lentTo?.(workId);
    if (lent !== undefined) return this.atRevision(repo, lent, workId!);
    const worktrees = this.worktrees;
    if (worktrees && workId !== undefined) return worktrees.acquire(workId, repo);
    return this.pathFor(repo);
  }

  private async git(repo: string, ...args: string[]) {
    const result = await this.runner.run("git", args, { cwd: this.pathFor(repo) });
    if (!result.ok) {
      throw new Error(`git ${args.join(" ")} failed in ${repo}: ${result.stderr || result.stdout}`);
    }
    return result;
  }

  /**
   * Puts the work on the ticket's branch, creating it from the default
   * branch when it does not exist yet.
   *
   * With a worktree port behind it, the branch is prepared inside the item's
   * own tree and never touches the standing checkout: acquiring the tree
   * makes no move at all, and `--ignore-other-worktrees` is what lets a
   * branch that exists because another item carried it be checked out here
   * without the second tree refusing or the first tree losing its place.
   */
  async prepareBranch(repo: string, branch: string, workId?: string): Promise<void> {
    this.mayMove(repo, branch, workId);
    const worktrees = this.worktrees;
    if (worktrees && workId !== undefined) {
      const tree = await worktrees.acquire(workId, repo);
      await this.onBranch(tree, repo, branch, ["--ignore-other-worktrees"]);
      return;
    }
    await this.onBranch(this.pathFor(repo), repo, branch, []);
  }

  /**
   * Gets onto `branch` in `cwd` without ever discarding a commit on it.
   *
   * A local branch can hold a commit the remote never saw: the machine
   * committed and the push failed. Resetting it to the remote, or to the
   * base, erases that work with nothing to say it existed, so the branch only
   * moves forward. When the target is ahead of it, the branch fast-forwards;
   * when it is ahead of the target, it is kept, and `commitAndPush` pushes
   * what it holds; when it has diverged from its remote, it is refused,
   * naming what only the local side holds.
   */
  private async onBranch(cwd: string, repo: string, branch: string, flags: string[]): Promise<void> {
    await this.gitIn(cwd, "fetch", "origin", "--prune");

    const remote = `refs/remotes/origin/${branch}`;
    const local = `refs/heads/${branch}`;
    const onRemote = await this.succeeds(cwd, "rev-parse", "--verify", remote);
    const target = onRemote ? `origin/${branch}` : `origin/${baseBranchFor(this.layout, repo)}`;

    if (!(await this.succeeds(cwd, "rev-parse", "--verify", local))) {
      await this.gitIn(cwd, "checkout", "-b", branch, target, ...flags);
      return;
    }

    if (await this.succeeds(cwd, "merge-base", "--is-ancestor", local, target)) {
      await this.gitIn(cwd, "checkout", branch, ...flags);
      await this.gitIn(cwd, "merge", "--ff-only", target);
      return;
    }

    if (onRemote && !(await this.succeeds(cwd, "merge-base", "--is-ancestor", remote, local))) {
      const unpushed = await this.gitIn(cwd, "log", "--oneline", `${target}..${local}`);
      throw new Error(
        `${branch} has diverged from ${target} in ${cwd}; refusing to reset it and lose what only the local branch holds:\n${unpushed.stdout.trim()}`,
      );
    }

    await this.gitIn(cwd, "checkout", branch, ...flags);
  }

  /** Whether git answered yes, for the commands whose exit code is the answer. */
  private async succeeds(cwd: string, ...args: string[]): Promise<boolean> {
    return (await this.runner.run("git", args, { cwd })).ok;
  }

  /** The commit the tree is at: the item's own, when a work id is named. */
  async headSha(repo: string, workId?: string): Promise<string> {
    if (workId === undefined) return (await this.git(repo, "rev-parse", "HEAD")).stdout;
    return (await this.gitIn(this.cwdFor(repo, workId), "rev-parse", "HEAD")).stdout.trim();
  }

  /**
   * A tree of the item's own, detached at a commit somebody else made, to
   * check and not to change.
   *
   * What a lane bound with `revision` is lent: every lane of a fork sees the
   * caller's commit rather than the base, and none of them can move the
   * caller's branch — the tree is detached, and every move this class makes
   * refuses a tree lent this way. Needs a worktree port: a revision is never
   * checked out in the standing checkout somebody may be working in.
   */
  async atRevision(repo: string, revision: string, workId: string): Promise<string> {
    const worktrees = this.worktrees;
    if (!worktrees) {
      throw new Error(`${workId} was lent ${revision.slice(0, 7)} to check, and no worktree is mounted to check it in; a revision is never checked out in the standing checkout`);
    }
    const tree = await worktrees.acquire(workId, repo);
    if (!(await this.succeeds(tree, "cat-file", "-e", `${revision}^{commit}`))) await this.gitIn(tree, "fetch", "origin", "--prune");
    await this.gitIn(tree, "checkout", "--detach", revision);
    const marker = lentMarker(tree);
    if (marker) fs.writeFileSync(marker, `${revision}\n`, "utf-8");
    return tree;
  }

  /**
   * Refuses a move in a tree lent at a revision, and a branch another lane
   * holds. Asked before a branch is checked out, committed on or pushed.
   */
  private mayMove(repo: string, branch: string | undefined, workId: string | undefined): void {
    const lane = this.leases ? runningLane.getStore() : undefined;
    if (lane !== undefined) return this.laneMayMove(lane, repo, branch, workId);
    if (workId !== undefined) this.notLent(repo, branch, workId);
  }

  /** Refuses a move in a tree lent at a revision, naming the commit. */
  private notLent(repo: string, branch: string | undefined, workId: string): void {
    const worktrees = this.worktrees;
    const lent = this.lentTo?.(workId) ?? (worktrees ? lentIn(worktrees.pathFor(workId, repo)) : undefined);
    if (lent) {
      throw new Error(`${workId} was lent ${lent.slice(0, 7)} to check, and checks it read-only: it cannot move ${branch ?? "a branch"} in ${repo}`);
    }
  }

  /**
   * A move a lane makes: only of its own work — never its caller's, never the
   * standing checkout's by passing no work id — never in a tree it was lent,
   * and only once it holds what it moves: the branch, in a tree of its own,
   * or the whole checkout, when the lanes share one.
   */
  private laneMayMove(lane: string, repo: string, branch: string | undefined, workId: string | undefined): void {
    if (workId === undefined || (workId !== lane && !workId.startsWith(`${lane}/`))) {
      throw new Error(`${lane} is a lane, and moves only its own work: it cannot move ${branch ?? "a branch"} in ${repo} as ${workId ?? "the standing checkout"}`);
    }
    this.notLent(repo, branch, workId);
    const held = this.worktrees ? branch : STANDING_CHECKOUT;
    if (held === undefined) return;
    const lease = this.leases!.take(repo, held, workId);
    if (!lease.taken) throw new LeaseHeld(repo, held, lease.holder);
  }

  /**
   * How many commits the branch in this item's tree holds beyond `of`.
   *
   * The question `commitAndPush` cannot answer by itself: a branch published
   * for the first time is a new remote ref whether or not it carries a
   * commit, so "a ref appeared" is not "there is something to review".
   */
  async commitsAhead(repo: string, of: string, workId?: string): Promise<number> {
    const result = await this.gitIn(
      this.cwdFor(repo, workId),
      "rev-list",
      "--count",
      `refs/remotes/origin/${of}..HEAD`,
    );
    return Number.parseInt(result.stdout.trim(), 10) || 0;
  }

  /**
   * Moves whatever the tree holds into a labelled stash, and leaves it clean.
   *
   * For work that must not be published and must not be lost: no branch
   * moves, so nothing a later branch reuses carries it, and no commit hook
   * runs, so unfinished work cannot refuse to be set aside. False when the
   * tree was already clean.
   */
  async setAside(repo: string, label: string, workId?: string): Promise<boolean> {
    const cwd = this.cwdFor(repo, workId);
    if (!(await this.hasChangesIn(cwd))) return false;
    await this.gitIn(cwd, "stash", "push", "--include-untracked", "--message", label);
    return true;
  }

  async hasChanges(repo: string, workId?: string): Promise<boolean> {
    const status = await this.gitIn(this.cwdFor(repo, workId), "status", "--porcelain");
    return status.stdout.length > 0;
  }

  /**
   * Commits whatever the agent left behind, and goes no further.
   *
   * A workflow that wants no round of work ever lost commits after each one,
   * and lets the remote see them once per cycle. Returns false when the tree
   * was clean, which is a real outcome rather than a failure.
   */
  async commit(repo: string, message: string, workId?: string): Promise<boolean> {
    this.mayMove(repo, undefined, workId);
    const cwd = this.cwdFor(repo, workId);
    if (!(await this.hasChangesIn(cwd))) return false;
    await this.gitIn(cwd, "add", "-A");
    await this.gitIn(cwd, "commit", "-m", message);
    return true;
  }

  /**
   * Pushes what the branch holds that the remote does not, as a fast-forward
   * or not at all.
   *
   * Returns false when the remote branch already held exactly this. The
   * answer is git's own, about the named branch: a count of commits missing
   * from every remote ref said "nothing to push" for a new branch cut at a
   * commit another branch had already pushed, and the branch never appeared.
   *
   * A remote branch somebody else moved is refused by git, and the refusal
   * is rethrown naming the branch, so the caller learns which one to fetch
   * rather than reading git's own words about refs. Nothing local is touched
   * by a refusal.
   */
  async push(repo: string, branch: string, workId?: string): Promise<boolean> {
    this.mayMove(repo, branch, workId);
    return this.pushIn(this.cwdFor(repo, workId), branch);
  }

  private async pushIn(cwd: string, branch: string): Promise<boolean> {
    const result = await this.runner.run("git", ["push", "--porcelain", "--set-upstream", "origin", branch], { cwd });
    if (result.ok) return updated(result.stdout, branch);
    const said = `${result.stderr}\n${result.stdout}`;
    if (/non-fast-forward|fetch first|\[rejected\]/.test(said)) {
      throw new Error(
        `refusing to push ${branch} from ${cwd}: origin/${branch} holds commits this branch does not, so the push is not a fast-forward. Fetch, and bring ${branch} forward onto it before pushing again.`,
      );
    }
    throw new Error(`git push --set-upstream origin ${branch} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }


  /**
   * Commits and pushes whatever the agent left behind, in one call.
   *
   * Returns false when there was nothing to commit and nothing to push, which
   * is a real outcome rather than a failure: an agent asked to address a
   * comment may correctly decide the code already says what it should. A
   * commit an earlier push never delivered is something to push, so a clean
   * tree still pushes it, and that counts.
   */
  async commitAndPush(
    repo: string,
    branch: string,
    message: string,
    workId?: string,
  ): Promise<boolean> {
    // A clean tree still pushes: a commit an earlier push never delivered
    // is something to push, and only git knows whether the branch has it.
    const committed = await this.commit(repo, message, workId);
    const pushed = await this.push(repo, branch, workId);
    return committed || pushed;
  }

  /** The tree the work happens in, for the mode this install chose. */
  private cwdFor(repo: string, workId?: string): string {
    const worktrees = this.worktrees;
    if (worktrees && workId !== undefined) {
      return worktrees.pathFor(workId, repo);
    }
    return this.pathFor(repo);
  }

  private async hasChangesIn(cwd: string): Promise<boolean> {
    const status = await this.gitIn(cwd, "status", "--porcelain");
    return status.stdout.length > 0;
  }

  /** The same git, run in a named tree rather than in the standing checkout. */
  private async gitIn(cwd: string, ...args: string[]) {
    const result = await this.runner.run("git", args, { cwd });
    if (!result.ok) {
      throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr || result.stdout}`);
    }
    return result;
  }
}

/**
 * Whether `git push --porcelain` moved the named branch: a line for it
 * flagged new (`*`) or fast-forwarded (a space), rather than up to date (`=`).
 */
function updated(porcelain: string, branch: string): boolean {
  return porcelain.split("\n").some((line) => {
    const [flag, refs] = line.split("\t");
    return (flag === "*" || flag === " ") && (refs ?? "").endsWith(`:refs/heads/${branch}`);
  });
}

/**
 * Where a tree records the revision it was lent: inside its own git
 * directory, so the mark goes when the tree does and never shows as a change
 * in it. Undefined for a tree that does not exist or is not a worktree.
 */
function lentMarker(tree: string): string | undefined {
  try {
    const pointer = fs.readFileSync(path.join(tree, ".git"), "utf-8").trim();
    const gitDir = /^gitdir:\s*(.+)$/.exec(pointer)?.[1];
    return gitDir ? path.join(path.resolve(tree, gitDir), "amy-lent-revision") : undefined;
  } catch {
    return undefined;
  }
}

/** The revision a tree was lent at, or undefined for a tree that is its own. */
function lentIn(tree: string): string | undefined {
  const marker = lentMarker(tree);
  if (!marker || !fs.existsSync(marker)) return undefined;
  return fs.readFileSync(marker, "utf-8").trim();
}
