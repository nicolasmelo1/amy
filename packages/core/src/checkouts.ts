import { ConfigSchema } from "./config-schema.js";
import { Git, RepoLayout } from "./git.js";
import { CommandRunner } from "./ports/CommandRunner.js";
import { Worktree } from "./ports/Worktree.js";

/**
 * The two branch settings, with the one description they have.
 *
 * A plugin that needs a repository's base spreads these into its own schema.
 * The settings stay the plugin's own — every existing `config.yaml` names
 * them per plugin — but what they mean is written once, here, so seven
 * schemas cannot describe one fact seven ways.
 */
export const BRANCH_SETTINGS = {
  defaultBranch: {
    type: "string",
    description: "the branch new work is cut from, for a repository that named none, which is not always `main`",
    default: "main",
  },
  baseBranch: {
    type: "record",
    description:
      "where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch",
    default: {},
  },
} as const satisfies ConfigSchema;

/** What the host lends a plugin that works in a repository's checkout. */
export interface Checkouts {
  /** Where the work happens and how it gets onto its branch. */
  readonly git: Git;
  /**
   * The same layout, for the question `Git` does not answer: what a pull
   * request opens against. Ask `baseBranchFor(layout, repo)`.
   */
  readonly layout: RepoLayout;
}

/**
 * The checkouts one plugin works in: the host's paths, the plugin's own branch
 * settings, and the worktree port read each time a path is asked for.
 *
 * A plugin that declared no `defaultBranch` gets the shared setting's default,
 * which is what it would have been handed had it spread `BRANCH_SETTINGS`.
 */
export function checkoutsFromSettings(
  runner: CommandRunner,
  paths: { readonly workspace: string; readonly checkouts: Readonly<Record<string, string>> },
  config: Readonly<Record<string, unknown>>,
  worktree: () => Worktree | undefined,
): Checkouts {
  return lendCheckouts(runner, {
    workspaceRoot: paths.workspace,
    checkouts: paths.checkouts,
    defaultBranch: defaultBranchOf(config),
    baseBranch: baseBranchesOf(config),
  }, worktree);
}

/**
 * The checkouts for a layout already in hand.
 *
 * What `PluginContext.checkouts()` answers with, exported for a test that
 * drives a port without mounting it. A plugin asks its context instead: the
 * architecture test refuses this, and `new Git`, anywhere outside the core's
 * own source.
 */
export function lendCheckouts(
  runner: CommandRunner,
  layout: RepoLayout,
  worktree?: Worktree | (() => Worktree | undefined),
): Checkouts {
  return { git: new Git(runner, layout, worktree), layout };
}

function defaultBranchOf(config: Readonly<Record<string, unknown>>): string {
  const value = config.defaultBranch;
  if (value === undefined) return BRANCH_SETTINGS.defaultBranch.default;
  if (typeof value !== "string") throw new Error(`\`defaultBranch\` must be a branch name, not ${JSON.stringify(value)}`);
  return value;
}

/** The one place `baseBranch`, validated only as a record, is narrowed to names. */
function baseBranchesOf(config: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> | undefined {
  const value = config.baseBranch;
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`\`baseBranch\` must map repositories to branch names, not ${JSON.stringify(value)}`);
  }
  for (const [repo, branch] of Object.entries(value)) {
    if (typeof branch !== "string") {
      throw new Error(`\`baseBranch\` names ${JSON.stringify(branch)} for \`${repo}\`, which is not a branch name`);
    }
  }
  return value as Readonly<Record<string, string>>;
}
