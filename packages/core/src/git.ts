import path from "node:path";
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
  constructor(
    private readonly runner: CommandRunner,
    private readonly layout: RepoLayout,
    private readonly worktrees?: Worktree,
  ) {}

  /**
   * Where the work for one repository happens.
   *
   * The mode question is answered once, here, rather than by every caller:
   * `HarnessAgent`, the gates and the workflow runtimes all read this, and
   * none of them learns whether this install isolates its checkouts.
   */
  pathFor(repo: string, workId?: string): string {
    if (this.worktrees && workId !== undefined) {
      return this.worktrees.pathFor(workId, repo);
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
    if (this.worktrees && workId !== undefined) return this.worktrees.acquire(workId, repo);
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
    if (this.worktrees && workId !== undefined) {
      const tree = await this.worktrees.acquire(workId, repo);
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
   * moves forward. One the target is ahead of fast-forwards; one ahead of the
   * target is kept, and `commitAndPush` pushes what it holds; one diverged
   * from its remote is refused, naming what only the local side holds.
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

  async headSha(repo: string): Promise<string> {
    return (await this.git(repo, "rev-parse", "HEAD")).stdout;
  }

  async hasChanges(repo: string, workId?: string): Promise<boolean> {
    const status = await this.gitIn(this.cwdFor(repo, workId), "status", "--porcelain");
    return status.stdout.length > 0;
  }

  /**
   * Commits and pushes whatever the agent left behind.
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
    const cwd = this.cwdFor(repo, workId);
    if (await this.hasChangesIn(cwd)) {
      await this.gitIn(cwd, "add", "-A");
      await this.gitIn(cwd, "commit", "-m", message);
      await this.gitIn(cwd, "push", "--set-upstream", "origin", branch);
      return true;
    }
    const unpushed = await this.gitIn(cwd, "rev-list", "--count", "HEAD", "--not", "--remotes=origin");
    if (Number(unpushed.stdout.trim()) > 0) {
      await this.gitIn(cwd, "push", "--set-upstream", "origin", branch);
      return true;
    }
    return false;
  }

  /** The tree the work happens in, for the mode this install chose. */
  private cwdFor(repo: string, workId?: string): string {
    if (this.worktrees && workId !== undefined) {
      return this.worktrees.pathFor(workId, repo);
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