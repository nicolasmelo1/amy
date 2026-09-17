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
   * branch that exists because another item carried it be cut again here
   * without the second tree refusing or the first tree losing its place.
   */
  async prepareBranch(repo: string, branch: string, workId?: string): Promise<void> {
    if (this.worktrees && workId !== undefined) {
      const tree = await this.worktrees.acquire(workId, repo);
      await this.gitIn(tree, "fetch", "origin", "--prune");

      const existsRemotely = await this.runner.run(
        "git",
        ["rev-parse", "--verify", `refs/remotes/origin/${branch}`],
        { cwd: tree },
      );

      if (existsRemotely.ok) {
        await this.gitIn(tree, "checkout", "-B", branch, `origin/${branch}`, "--ignore-other-worktrees");
        return;
      }

      await this.gitIn(tree, "checkout", "-B", branch, `origin/${this.layout.defaultBranch}`, "--ignore-other-worktrees");
      return;
    }

    await this.git(repo, "fetch", "origin", "--prune");

    const existsRemotely = await this.runner.run(
      "git",
      ["rev-parse", "--verify", `refs/remotes/origin/${branch}`],
      { cwd: this.pathFor(repo) },
    );

    if (existsRemotely.ok) {
      await this.git(repo, "checkout", "-B", branch, `origin/${branch}`);
      return;
    }

    await this.git(repo, "checkout", "-B", branch, `origin/${this.layout.defaultBranch}`);
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
   * Returns false when there was nothing to commit, which is a real outcome
   * rather than a failure: an agent asked to address a comment may correctly
   * decide the code already says what it should.
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