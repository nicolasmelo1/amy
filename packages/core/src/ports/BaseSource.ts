import { CommandRunner } from "./CommandRunner.js";
import { RepoLayout, baseBranchFor, checkoutFor } from "../git.js";

/** A read-only view of one repository at its configured base revision. */
export interface BaseSourceSnapshot {
  readonly repo: string;
  readonly baseBranch: string;
  /** Reads a tracked file as it exists at the configured base branch. */
  read(path: string): Promise<string | null>;
}

/**
 * The narrow source capability grooming receives.
 *
 * It intentionally exposes neither a checkout path nor Git/worktree operations:
 * a groomer can inspect source at the configured base and cannot repoint the
 * standing checkout, create a branch, commit, or acquire a worktree.
 */
export interface BaseSource {
  snapshot(repo: string): Promise<BaseSourceSnapshot>;
}

/**
 * Reads `origin/<base>` directly through Git objects. No checkout command is
 * issued, so a standing branch remains exactly where its owner left it.
 */
export class GitBaseSource implements BaseSource {
  constructor(
    private readonly runner: CommandRunner,
    private readonly layout: RepoLayout,
  ) {}

  async snapshot(repo: string): Promise<BaseSourceSnapshot> {
    const cwd = checkoutFor(this.layout, repo);
    const baseBranch = baseBranchFor(this.layout, repo);
    const probe = await this.runner.run("git", ["rev-parse", "--verify", `origin/${baseBranch}`], { cwd });
    if (!probe.ok) throw new Error(`the grooming source cannot read ${repo} at origin/${baseBranch}: ${probe.stderr || probe.stdout}`);

    return {
      repo,
      baseBranch,
      read: async (file) => {
        const result = await this.runner.run("git", ["show", `origin/${baseBranch}:${file}`], { cwd });
        if (result.ok) return result.stdout;
        // A missing file is an ordinary source fact; another failure is not.
        if (result.stderr.includes("does not exist") || result.stderr.includes("exists on disk")) return null;
        throw new Error(`the grooming source could not read ${file} in ${repo}: ${result.stderr || result.stdout}`);
      },
    };
  }
}
