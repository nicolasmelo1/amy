/**
 * One isolated checkout per piece of work, or none.
 *
 * A shared checkout is one mutable tree everything contends for: two tickets
 * on one repository cannot implement at the same time, an interrupted run
 * leaves the tree dirty under the next item's gate, and preparing an item can
 * repoint a branch an existing pull request is built on. This port is the
 * seam underneath all of that — a workflow never shells out to `git worktree`
 * on its own, and never invents cleanup, discovery or recovery.
 *
 * The provider mounts the port unconditionally; the consumer reads it as
 * `Worktree | undefined` and runs unchanged when nothing mounted one, which
 * is what keeps a shared-checkout install a real install.
 */

/** What a tree is, as the manager holds it on disk. */
export interface WorktreeInfo {
  /** The work the tree belongs to, as the queue and the record name it. */
  workId: string;
  /** The repository the work is in, as `owner/name`. */
  repo: string;
  /** The workflow that acquired it, which is also the first path segment. */
  workflow: string;
  /** Where the tree lives, outside every repository. */
  path: string;
  /**
   * Whether the work is still going. `in-flight` is a record the store still
   * holds in a non-terminal state; `terminal` is work that finished; `orphaned`
   * is a tree whose work id is no longer in the store at all — offered for
   * recovery before any prune touches it.
   */
  state: "in-flight" | "terminal" | "orphaned";
  /** Whether the tree holds no uncommitted change. */
  clean: boolean;
  /** The branch the tree is on, as the tracker named it. */
  branch: string;
  /** When the tree was created, and when it was last used. */
  acquiredAt: string;
  updatedAt: string;
  /** Whether the tree is past its retention window. */
  retentionEligible: boolean;
  /**
   * Whether an automatic prune may remove it: terminal, clean, and past
   * retention. Everything else — a crash, an escalation, a dirty tree, work
   * still going — is retained, and the only way out is a named command.
   */
  prunable: boolean;
}

/**
 * Checkout isolation for one install.
 *
 * Trees are predictable paths under one root, created or reused, never
 * reset. Acquisition never touches the standing checkout: not its files, not
 * its uncommitted work, not the branch it is sitting on.
 */
export interface Worktree {
  /**
   * The path of this item's own tree, creating it when it does not exist and
   * reusing it when it does. A new tree is cut from the default branch; the
   * item's branch is prepared there by `Git`, which owns branch vocabulary.
   */
  acquire(workId: string, repo: string): Promise<string>;

  /**
   * The path this item's tree would live at, without touching the disk.
   *
   * What a caller reads when it needs the path for an agent step and the
   * tree's existence is the acquire's business, not its own.
   */
  pathFor(workId: string, repo: string): string;

  /** Every tree this machine holds, and what state each is in. */
  states(): Promise<WorktreeInfo[]>;

  /**
   * Removes a tree that has become safe to remove, and says whether it did.
   *
   * An in-flight or dirty tree is refused, naming the reason, unless the
   * caller forces it — the escape hatch is a named command, never a predicate.
   * Every removal that happens is logged.
   */
  release(workId: string, repo: string, options?: { force?: boolean }): Promise<boolean>;

  /**
   * Removes every tree the retention predicate allows, and leaves every other
   * one exactly as it was.
   *
   * Safe to call at any time, from the daemon's startup and after terminal
   * work alike: the predicates below decide, never the caller.
   */
  prune(now: Date): Promise<string[]>;
}