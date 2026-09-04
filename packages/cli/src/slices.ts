import path from "node:path";
import { AmyConfig } from "./config.js";

/**
 * The settings each plugin gets, derived from the top-level config.
 *
 * A compatibility shim, and named as one. The config file still carries the
 * shape it had before plugins declared their own settings, so this translates
 * it. An explicit `plugins:` slice always wins, which is the direction this
 * is moving in.
 */
export function pluginSlices(config: AmyConfig): Record<string, unknown> {
  const derived: Record<string, unknown> = {
    "@amy/plugin-linear": {
      workingStatusName: config.workingStatusName,
      repoByTeam: config.repoByTeam,
      defaultRepo: config.repos[0] ?? "",
    },
    "@amy/plugin-claude": harnessSlice(config, "claude"),
    "@amy/plugin-codex": harnessSlice(config, "codex"),
    "@amy/plugin-hermes-agent": harnessSlice(config, "hermes"),
    "@amy/plugin-agent-relay": {
      ladder: config.agent.ladder ?? [],
      budget: config.agent.budget ?? {},
      skills: config.skills,
    },
    "@amy/plugin-command-gate": {
      defaultBranch: config.defaultBranch,
      commands: config.gate,
    },
    "@amy/plugin-file-queue": {
      retentionDays: config.retentionDays,
      staleClaimMs: config.staleClaimMs,
    },
    // The workflow's own vocabulary: which repositories it counts review
    // load across, where it hands work over, and the ceilings its decision
    // function reads.
    "@amy/workflow-ticket-to-qa": {
      repos: config.repos,
      qaStatusName: config.qaStatusName,
      policy: config.policy,
    },
    // The engine's, and none of it names a domain.
    "@amy/plugin-serial-engine": {
      staleClaimMs: config.staleClaimMs,
      retentionDays: config.retentionDays,
      maxItemAttempts: config.maxItemAttempts,
      retryDelayMs: config.policy.pollBackoffMs,
    },
  };

  if (config.notify.hermes) {
    derived["@amy/plugin-notify-hermes"] = { target: config.notify.hermes };
  }
  if (config.notify.inbox) {
    derived["@amy/plugin-notify-inbox"] = { directory: "needs-input" };
  }

  return { ...derived, ...config.plugins };
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
  const fromLadder = tiersFor(config.agent.ladder ?? [], harness);

  return {
    defaultBranch: config.defaultBranch,
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

/** Whether a ladder mentions a harness at all, which is what mounts it. */
export function ladderNames(ladder: readonly string[], harness: string): boolean {
  return ladder.some((entry) => entry === harness || entry.startsWith(`${harness}:`));
}

/** Which plugins to mount: what the config asked for, or the built-in set. */
export function pluginList(config: AmyConfig, builtIn: readonly string[]): string[] {
  if (config.pluginList.length > 0) return [...config.pluginList];

  const ladder = config.agent.ladder ?? [];

  // A channel nobody configured should not be mounted, or the fan-out would
  // announce into a target that is not there. Same reasoning for a harness:
  // mounting one whose binary is not installed only produces a doctor failure
  // for a tool the operator never asked for.
  return builtIn.filter((name) => {
    if (name === "@amy/plugin-notify-hermes") return Boolean(config.notify.hermes);
    if (name === "@amy/plugin-notify-inbox") return config.notify.inbox;
    if (name === "@amy/plugin-codex") return ladderNames(ladder, "codex");
    if (name === "@amy/plugin-hermes-agent") return ladderNames(ladder, "hermes");
    return true;
  });
}

/** Where the host keeps its own state, and where the checkouts live. */
export function hostPaths(config: AmyConfig, stateDir: string) {
  return { workspace: path.resolve(config.workspaceRoot), state: stateDir };
}
