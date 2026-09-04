import path from "node:path";
import { CommandRunner } from "./ports/CommandRunner.js";

export interface RepoLayout {
  /** Directory that holds one checkout per repository. */
  workspaceRoot: string;
  /** Branch new work is cut from. */
  defaultBranch: string;
}

/**
 * The git side of a ticket: get onto its branch, and get the work pushed.
 *
 * The branch name is always the one the tracker gave us, never derived here,
 * because the tracker owns the slug and links the pull request by it.
 */
export class Git {
  constructor(
    private readonly runner: CommandRunner,
    private readonly layout: RepoLayout,
  ) {}

  /** `Northwind/northwind-backend` becomes `<workspaceRoot>/northwind-backend`. */
  pathFor(repo: string): string {
    const name = repo.includes("/") ? repo.slice(repo.indexOf("/") + 1) : repo;
    return path.join(this.layout.workspaceRoot, name);
  }

  private async git(repo: string, ...args: string[]) {
    const result = await this.runner.run("git", args, { cwd: this.pathFor(repo) });
    if (!result.ok) {
      throw new Error(`git ${args.join(" ")} failed in ${repo}: ${result.stderr || result.stdout}`);
    }
    return result;
  }

  /**
   * Puts the checkout on the ticket's branch, creating it from the default
   * branch when it does not exist yet.
   */
  async prepareBranch(repo: string, branch: string): Promise<void> {
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

  async hasChanges(repo: string): Promise<boolean> {
    const status = await this.git(repo, "status", "--porcelain");
    return status.stdout.length > 0;
  }

  /**
   * Commits and pushes whatever the agent left behind.
   *
   * Returns false when there was nothing to commit, which is a real outcome
   * rather than a failure: an agent asked to address a comment may correctly
   * decide the code already says what it should.
   */
  async commitAndPush(repo: string, branch: string, message: string): Promise<boolean> {
    if (!(await this.hasChanges(repo))) {
      return false;
    }

    await this.git(repo, "add", "-A");
    await this.git(repo, "commit", "-m", message);
    await this.git(repo, "push", "--set-upstream", "origin", branch);
    return true;
  }
}
