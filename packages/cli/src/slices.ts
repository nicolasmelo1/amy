import path from "node:path";
import { AmyConfig } from "./config.js";
import { Profile, directoriesFor, recommendedFor } from "./profiles.js";

/**
 * The settings each plugin gets, derived from the top-level config.
 *
 * A compatibility shim, and named as one. The config file still carries the
 * shape it had before plugins declared their own settings, so this translates
 * it. An explicit `plugins:` slice always wins, which is the direction this
 * is moving in.
 */
export function pluginSlices(config: AmyConfig, profile: Profile): Record<string, unknown> {
  const dirs = directoriesFor(profile.name);

  const derived: Record<string, unknown> = {
    "@amykit/plugin-linear": {
      workingStatusName: config.workingStatusName,
      repoByTeam: config.repoByTeam,
      defaultRepo: config.repos[0] ?? "",
    },
    "@amykit/plugin-claude": harnessSlice(config, "claude"),
    "@amykit/plugin-codex": harnessSlice(config, "codex"),
    "@amykit/plugin-hermes-agent": harnessSlice(config, "hermes"),
    "@amykit/plugin-agent-relay": {
      ladder: config.agent.ladder ?? [],
      ladderByStep: config.agent.ladderByStep ?? {},
      budget: config.agent.budget ?? {},
      skills: config.skills,
    },
    "@amykit/plugin-command-gate": {
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      checkouts: config.checkouts,
      commands: config.gate,
    },
    "@amykit/plugin-file-queue": {
      directory: dirs.queue,
      retentionDays: config.retentionDays,
      staleClaimMs: config.staleClaimMs,
    },
    "@amykit/plugin-file-store": { directory: dirs.records },
    "@amykit/plugin-file-brief-store": briefStoreSlice(config),
    // Mounted in both profiles: one writes the notes, the other reads them,
    // and an install running only the first would still be filing the
    // friction the second will pick up.
    "@amykit/plugin-file-notes": {
      directory: "notes",
      repo: config.plans.repos[0] ?? "",
      writeFailureNotes: config.plans.repos.length > 0,
    },
    // The second workflow's own vocabulary: which repositories it may write a
    // plan into, and the ceilings its decision function reads.
    "@amykit/workflow-note-to-plan": {
      repos: config.plans.repos,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      policy: config.plans.policy,
    },
    // The third workflow's vocabulary: where an errand may be done, and the
    // ceilings its decision function reads.
    "@amykit/workflow-errand": {
      repos: config.repos,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      policy: config.errands.policy,
    },
    "@amykit/workflow-feature-grooming": {
      repos: config.repos,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
    },
    "@amykit/plugin-file-tasks": {
      directory: "tasks",
      repo: config.repos[0] ?? "",
    },
    "@amykit/plugin-plan-check": {
      defaultBranch: config.defaultBranch,
      commands: config.plans.check,
    },
    // The workflow's own vocabulary: which repositories it counts review
    // load across, where it hands work over, and the ceilings its decision
    // function reads.
    "@amykit/workflow-ticket-to-qa": {
      repos: config.repos,
      // Both halves of the layout, named the way the workflow's own schema
      // does: the branch a repository without a mapping is cut from, and the
      // map that names one. Derived here so no workflow package carries a
      // branch mapping of its own.
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      qaStatusName: config.qaStatusName,
      policy: config.policy,
    },
    // The workplace: where the trees live and how long finished ones stay.
    // `workflow` names the mount itself, because the tree paths carry it —
    // the profile's name is what the config calls this workflow, and two
    // profiles must never share a tree.
    "@amykit/plugin-file-worktree": {
      root: config.worktrees.root,
      workflow: profile.name,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      checkouts: config.checkouts,
      retentionDays: config.worktrees.retentionDays,
    },
    // The engine's, and none of it names a domain.
    "@amykit/plugin-serial-engine": {
      staleClaimMs: config.staleClaimMs,
      retentionDays: config.retentionDays,
      maxItemAttempts: config.maxItemAttempts,
      retryDelayMs: config.policy.pollBackoffMs,
    },
  };

  if (config.notify.hermes) {
    derived["@amykit/plugin-notify-hermes"] = { target: config.notify.hermes };
  }
  if (config.notify.inbox) {
    derived["@amykit/plugin-notify-inbox"] = { directory: "needs-input" };
  }

  // Merged per plugin, not replaced. A slice written by hand names the one
  // or two settings somebody meant to change; replacing the whole slice would
  // drop the derived ones beside them — which is how two profiles ended up
  // sharing a queue, because the operator had set `retentionDays` and lost
  // `directory` without being told.
  const merged: Record<string, unknown> = { ...derived };
  for (const [name, given] of Object.entries(config.plugins)) {
    merged[name] = isRecord(derived[name]) && isRecord(given) ? { ...derived[name], ...given } : given;
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The file-store setting from before BriefStore became its own plugin.
 *
 * Keep accepting it at the old slice and carry its value to the new mount:
 * an upgrade must read the existing briefs, while a setting written directly
 * for the new provider still wins in the ordinary per-plugin merge below.
 */
function fileStoreBriefDirectory(config: AmyConfig): string | undefined {
  const fileStore = config.plugins["@amykit/plugin-file-store"];
  return isRecord(fileStore) && typeof fileStore.briefsDirectory === "string"
    ? fileStore.briefsDirectory
    : undefined;
}

/** The file BriefStore's settings, including the one-time legacy translation. */
function briefStoreSlice(config: AmyConfig): { directory: string } {
  return { directory: fileStoreBriefDirectory(config) ?? "briefs" };
}

/**
 * The settings a harness plugin gets.
 *
 * The tiers come from the ladder rather than from a second list, so there is
 * one place to edit. `claude:sonnet, claude:opus` in the ladder is what makes
 * the claude plugin contribute two agents, and the relay then finds both
 * names it was told to try.
 */
function harnessSlice(config: AmyConfig, harness: string): Record<string, unknown> {
  const fromLadder = tiersFor(everyLadderEntry(config), harness);

  return {
    defaultBranch: config.defaultBranch,
    // The per-repository map rides beside the branch: both are the layout a
    // `Git` needs to find a checkout, and the shim is how they reach it.
    checkouts: config.checkouts,
    // And the map of base branches rides beside them both, for the same
    // reason: the repository is known per piece of work, not when the slice
    // is built.
    baseBranch: config.baseBranch,
    model: config.agent.model ?? "",
    models: fromLadder.length > 0 ? fromLadder : (config.agent.models ?? []),
    reviewerHints: config.agent.reviewerHints ?? {},
    ...(config.agent.timeoutMs === undefined ? {} : { timeoutMs: config.agent.timeoutMs }),
  };
}

/**
 * The models a ladder asks of one harness, in ladder order.
 *
 * A bare `claude` entry means "whatever model is configured", which is the
 * single-model install, so it contributes the empty tier rather than a model
 * literally named "claude".
 */
export function tiersFor(ladder: readonly string[], harness: string): string[] {
  return ladder
    .filter((entry) => entry === harness || entry.startsWith(`${harness}:`))
    .map((entry) => entry.slice(harness.length + 1));
}

/**
 * Every rung any step could reach, the default ladder and the per-step ones.
 *
 * Both, because a model named only inside `ladderByStep` is still a model the
 * harness plugin has to contribute and a harness the profile has to mount.
 * Reading only the default would refuse that mount at boot, correctly but
 * for a reason nobody could see from the config they wrote.
 */
function everyLadderEntry(config: AmyConfig): string[] {
  return [
    ...(config.agent.ladder ?? []),
    ...Object.values(config.agent.ladderByStep ?? {}).flat(),
  ];
}

/** Whether a ladder mentions a harness at all, which is what mounts it. */
export function ladderNames(ladder: readonly string[], harness: string): boolean {
  return ladder.some((entry) => entry === harness || entry.startsWith(`${harness}:`));
}

/** Which plugins to mount: what the profile asked for, or what is recommended. */
export function pluginList(config: AmyConfig, profile: Profile): string[] {
  if (profile.plugins.length > 0) {
    const explicit = [...profile.plugins, ...config.extraPlugins.filter((name) => !profile.plugins.includes(name))];
    return withBriefStore(profile, explicit);
  }

  const ladder = everyLadderEntry(config);

  // A channel nobody configured should not be mounted, or the fan-out would
  // announce into a target that is not there. Same reasoning for a harness:
  // mounting one whose binary is not installed only produces a doctor failure
  // for a tool the operator never asked for.
  const recommended = recommendedFor(profile).filter((name) => {
    // A note needs somewhere to go. An install that named no repository to
    // write plans into would be watching a directory nothing could ever come
    // out of, so it does not watch one.
    if (name === "@amykit/plugin-file-notes") return config.plans.repos.length > 0;
    if (name === "@amykit/plugin-notify-hermes") return Boolean(config.notify.hermes);
    if (name === "@amykit/plugin-notify-inbox") return config.notify.inbox;
    if (name === "@amykit/plugin-codex") return ladderNames(ladder, "codex");
    if (name === "@amykit/plugin-hermes-agent") return ladderNames(ladder, "hermes");
    return true;
  });

  // The extras ride after what was recommended, deduplicated: a plugin named
  // both places is one mount, and `mount()` would refuse the second claim of
  // a port rather than read the list as an intention.
  return withBriefStore(profile, [...recommended, ...config.extraPlugins.filter((name) => !recommended.includes(name))]);
}

/** Replaces the local BriefStore when a profile selects its own provider. */
function withBriefStore(profile: Profile, plugins: readonly string[]): string[] {
  const local = "@amykit/plugin-file-brief-store";
  // `""` is the removal trial's explicit absence: do not let the legacy
  // file-store compatibility rule recreate the provider it just removed.
  const chosen = profile.briefStore === ""
    ? undefined
    : profile.briefStore ?? (plugins.includes("@amykit/plugin-file-store") ? local : undefined);
  if (!chosen) return [...plugins];

  const replaced = plugins.map((name) => name === local ? chosen : name);
  return replaced.includes(chosen) ? replaced : [...replaced, chosen];
}

/** Where the host keeps its own state, and where the checkouts live. */
export function hostPaths(config: AmyConfig, stateDir: string) {
  return {
    workspace: path.resolve(config.workspaceRoot),
    checkouts: config.checkouts,
    state: stateDir,
  };
}
