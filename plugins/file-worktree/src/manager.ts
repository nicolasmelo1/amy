import fs from "node:fs";
import path from "node:path";
import { baseBranchFor, CommandRunner, EventLog, Worktree, WorktreeInfo } from "@amykit/core";

export interface WorktreeManagerConfig {
  /** Where every tree lives, outside any repository. `~` is expanded. */
  root: string;
  /** The workflow this install drives, which is the first path segment. */
  workflow: string;
  /** The branch new trees are cut from, for a repository that named none. */
  defaultBranch: string;
  /**
   * Where one repository's base branch is, instead of the fallback.
   *
   * The cut a tree is made from is the same answer `Git.prepareBranch` cuts
   * the branch from, so the two cannot disagree about what a repository's
   * base is: one map, one resolution, handed to both.
   */
  baseBranch?: Readonly<Record<string, string>>;
  /** The standing checkouts, used only as the source for a named repository. */
  workspaceRoot?: string;
  /**
   * Where one repository's standing checkout is, instead of under the root.
   *
   * The source a tree is cut from is the same answer `Git` resolves, so a
   * repository named here is never looked for under `workspaceRoot` at all.
   */
  checkouts?: Readonly<Record<string, string>>;
  /** How many days a terminal, clean tree stays before a prune may take it. */
  retentionDays: number;
  /**
   * Where one work's record lives on disk, by id, or null when the store
   * holds nothing for it.
   *
   * Handed in rather than built here because the records' home is the
   * profile's, and the manager must not learn where a profile keeps its
   * state to decide whether a tree is orphaned. The record is returned
   * whole, because the tree's state is read off it, not off its existence.
   */
  record: (workId: string) => { state: string } | null;
  /** The states the mounted workflow calls terminal, as it names them. */
  terminalStates: readonly string[];
  /** The log the removals are written to, when there is one. */
  log?: EventLog;
}

interface TreeMeta {
  workId: string;
  repo: string;
  acquiredAt: string;
  updatedAt: string;
}

/**
 * One tree per item, under one root.
 *
 * Layout: `<root>/<workflow>/<workId>/<repo>` — predictable from the things
 * an operator already knows, outside every repository, and removable as a
 * unit. Nothing here resets, repoints or touches a standing checkout:
 * acquisition either creates a tree cut from the default branch or reuses
 * the one that is already there, dirty or not.
 */
export class WorktreeManager implements Worktree {
  constructor(
    private readonly runner: CommandRunner,
    private readonly config: WorktreeManagerConfig,
  ) {}

  async acquire(workId: string, repo: string): Promise<string> {
    const tree = this.pathFor(workId, repo);
    if (fs.existsSync(path.join(tree, ".git"))) {
      this.touch(workId, repo);
      return tree;
    }

    fs.mkdirSync(tree, { recursive: true });

    // Detached at the base branch. A ticket's branch is prepared later;
    // detaching prevents two new trees claiming one branch. The base is the
    // same answer `Git` cuts from, resolved per repository rather than as one
    // name for the whole install.
    const cut = await this.runner.run(
      "git",
      ["worktree", "add", "--detach", tree, this.cutRef(repo)],
      { cwd: this.sourceFor(repo) },
    );

    if (!cut.ok) {
      const message = cut.stderr || cut.stdout;
      throw new Error(`could not create a worktree for ${workId} in ${repo}: ${message}`);
    }

    // A worktree cut straight from a bare repository inherits no remotes.
    // The core Git bridge fetches and pushes through `origin`, so name the
    // source as origin only when the new tree did not inherit one from a
    // standing checkout.
    const remote = await this.runner.run("git", ["remote", "get-url", "origin"], { cwd: tree });
    if (!remote.ok) {
      const added = await this.runner.run("git", ["remote", "add", "origin", repo], { cwd: tree });
      if (!added.ok) {
        throw new Error(`could not name ${repo} as origin for ${tree}: ${added.stderr || added.stdout}`);
      }
    }

    this.writeMeta(workId, repo);
    return tree;
  }

  /** The base branch, named the way the thing being cut from holds it. */
  private cutRef(repo: string): string {
    const { defaultBranch, baseBranch } = this.config;
    return `refs/heads/${baseBranchFor({ workspaceRoot: "", defaultBranch, baseBranch }, repo)}`;
  }

  pathFor(workId: string, repo: string): string {
    return path.join(this.config.root, this.config.workflow, this.safe(workId), this.safe(repo));
  }

  async states(): Promise<WorktreeInfo[]> {
    const base = path.join(this.config.root, this.config.workflow);
    if (!fs.existsSync(base)) return [];

    const now = new Date();
    const found: WorktreeInfo[] = [];

    for (const workId of fs.readdirSync(base)) {
      const workDir = path.join(base, workId);
      if (!fs.statSync(workDir).isDirectory()) continue;

      for (const repo of fs.readdirSync(workDir)) {
        const tree = path.join(workDir, repo);
        if (!fs.existsSync(path.join(tree, ".git"))) continue;

        const meta = this.readMeta(workId, repo);
        found.push(await this.describe(meta?.workId ?? workId, meta?.repo ?? repo, tree, meta, now));
      }
    }

    return found.sort((a, b) => a.workId.localeCompare(b.workId) || a.repo.localeCompare(b.repo));
  }

  async release(workId: string, repo: string, options?: { force?: boolean }): Promise<boolean> {
    const tree = this.pathFor(workId, repo);
    if (!fs.existsSync(path.join(tree, ".git"))) return false;

    const info = await this.describe(workId, repo, tree, this.readMeta(workId, repo), new Date());

    if (!options?.force) {
      const why = refusalFor(info);
      if (why) {
        this.log("worktree.retained", { workId, repo, reason: why });
        throw new Error(`refusing to remove ${tree}: ${why} (use --force to remove it anyway)`);
      }
    }

    await this.remove(tree);
    this.log("worktree.removed", {
      workId,
      repo,
      reason: options?.force ? "removed by hand, over a refusal" : "removed by command",
    });
    return true;
  }

  async prune(_now: Date): Promise<string[]> {
    const removed: string[] = [];

    for (const info of await this.states()) {
      if (!info.prunable) continue;

      await this.remove(info.path);
      this.log("worktree.removed", {
        workId: info.workId,
        repo: info.repo,
        reason: `terminal and clean, past ${this.config.retentionDays} day(s) of retention`,
      });
      removed.push(info.workId);
    }

    // A work directory whose trees are all gone names nothing, which is the
    // same litter as a tree naming nothing.
    this.dropEmptyWorkDirectories();
    return removed;
  }

  /**
   * What one tree is, read off the disk rather than off a memory of what
   * happened.
   *
   * Every field the list names is derived here, in one place, so the CLI and
   * the prune cannot disagree about what `prunable` means.
   */
  private async describe(
    workId: string,
    repo: string,
    tree: string,
    meta: TreeMeta | null,
    now: Date,
  ): Promise<WorktreeInfo> {
    const status = await this.runner.run("git", ["status", "--porcelain"], { cwd: tree });
    const branch = await this.runner.run("git", ["branch", "--show-current"], { cwd: tree });
    const clean = status.ok && status.stdout.length === 0;

    const updatedAt = meta?.updatedAt ?? meta?.acquiredAt ?? now.toISOString();
    const ageDays = (now.getTime() - new Date(updatedAt).getTime()) / 86_400_000;
    const past = ageDays >= this.config.retentionDays;
    const terminal = this.isTerminal(workId);

    return {
      workId,
      repo,
      workflow: this.config.workflow,
      path: tree,
      state: terminal ? "terminal" : this.config.record(workId) ? "in-flight" : "orphaned",
      clean,
      branch: branch.stdout.trim(),
      acquiredAt: meta?.acquiredAt ?? updatedAt,
      updatedAt,
      retentionEligible: past,
      prunable: terminal && clean && past,
    };
  }

  /**
   * Whether the work reached a state the workflow calls terminal.
   *
   * Read off the record, not off the tree: a tree's files cannot say what
   * state its work is in, and the record is the one thing that can.
   */
  private isTerminal(workId: string): boolean {
    const record = this.config.record(workId);
    return record !== null && this.config.terminalStates.includes(record.state);
  }

  private log(event: Parameters<EventLog["append"]>[0]["kind"], detail: Record<string, unknown>): void {
    this.config.log?.append({
      at: new Date().toISOString(),
      kind: event,
      detail,
    });
  }

  private async remove(tree: string): Promise<void> {
    // `git worktree remove` wants to run from inside the repository the tree
    // was cut from, so the gitdir inside the tree names it. Reading it there
    // rather than keeping a second copy of the mapping is what keeps this
    // honest when a tree outlives the config that made it.
    const gitDir = fs.readFileSync(path.join(tree, ".git"), "utf-8").trim();
    const origin = path.resolve(tree, gitDir.replace(/^gitdir:\s*/, "").replace(/\/\.git$/, ""));
    await this.runner.run("git", ["worktree", "remove", "--force", tree], { cwd: origin });
    fs.rmSync(tree, { recursive: true, force: true });
  }

  private refusalFor = refusalFor;

  /**
   * Metadata belongs beside the tree, never inside it: git correctly calls
   * every untracked file in a checkout dirty, and an implementation detail
   * must not make a clean terminal tree impossible to prune.
   */
  private metaFileFor(workId: string, repo: string): string {
    return path.join(
      this.config.root,
      this.config.workflow,
      ".meta",
      this.safe(workId),
      `${this.safe(repo)}.json`,
    );
  }

  private writeMeta(workId: string, repo: string): void {
    const now = new Date().toISOString();
    const meta: TreeMeta = { workId, repo, acquiredAt: now, updatedAt: now };
    const file = this.metaFileFor(workId, repo);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  }

  private readMeta(workId: string, repo: string): TreeMeta | null {
    try {
      return JSON.parse(fs.readFileSync(this.metaFileFor(workId, repo), "utf-8")) as TreeMeta;
    } catch {
      return null;
    }
  }

  private touch(workId: string, repo: string): void {
    const meta = this.readMeta(workId, repo);
    if (!meta) return;
    fs.writeFileSync(
      this.metaFileFor(workId, repo),
      `${JSON.stringify({ ...meta, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf-8",
    );
  }

  private dropEmptyWorkDirectories(): void {
    const base = path.join(this.config.root, this.config.workflow);
    if (!fs.existsSync(base)) return;

    for (const entry of fs.readdirSync(base)) {
      if (entry === ".meta") continue;
      const workDir = path.join(base, entry);
      try {
        if (fs.readdirSync(workDir).length === 0) fs.rmdirSync(workDir);
      } catch {
        // A directory that will not let itself be measured keeps standing.
      }
    }
  }

  /** A path segment, made safe to be one. */
  private safe(part: string): string {
    return part.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  }

  /** A logical `owner/repo` lives under the configured standing checkout root. */
  private sourceFor(repo: string): string {
    if (path.isAbsolute(repo)) return repo;
    const named = this.config.checkouts?.[repo];
    if (named !== undefined) return named;
    if (!this.config.workspaceRoot) return repo;
    const name = repo.includes("/") ? repo.slice(repo.indexOf("/") + 1) : repo;
    return path.join(this.config.workspaceRoot, name);
  }
}

/**
 * Why a tree holds its ground, when it does.
 *
 * An in-flight tree is work that is still going; a dirty tree is whatever the
 * agent left behind when a run stopped. Neither is the machine's to delete —
 * the escape hatch is a named command with `--force`, never a predicate.
 */
function refusalFor(info: WorktreeInfo): string | undefined {
  if (info.state === "in-flight") return "the work is still going — retire it first";
  if (!info.clean) return "the tree is dirty, and what is in it is somebody's work";
  return undefined;
}