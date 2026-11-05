/** The port kind the workplace is mounted under: the provider is the machine's workspace. */
export const WORKSPACE_PORT = "workspace";

/**
 * The workplace, answered by the plugin whose slice names it.
 *
 * One plugin owns the machine's workspace: the repositories, where their
 * standing checkouts live, the branches, the worktrees. Nothing outside that
 * plugin's slice carries the vocabulary, and `PluginContext.checkouts()`
 * answers through what this port's provider holds, so a plugin works in the
 * same workplace the worktrees and the doctor see.
 */
export interface Workspace {
  /** Where the standing checkouts the workflows and gates work in live. */
  readonly workspaceRoot: string;
  /**
   * Where one repository's checkout is, instead of under the root.
   *
   * A repository named here is never looked for under the root at all, so
   * work can span repositories two unrelated parents hold.
   */
  readonly checkouts: Readonly<Record<string, string>>;
}
