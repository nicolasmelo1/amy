import path from "node:path";
import { AmyConfig } from "./config.js";
import { Profile, directoriesFor, projectStateKey, recommendedFor } from "./profiles.js";
import { profilePaths } from "./paths.js";

/**
 * The settings each plugin gets, derived from the top-level config.
 *
 * A compatibility shim, and named as one. The config file still carries the
 * machine's own settings at the top level, so this translates those — the
 * repositories, the branches, the agent block, the engine's ceilings. A
 * workflow's own vocabulary is not translated anywhere: it lives in the
 * profile that drives it, and the mount checks it against the workflow's own
 * schema. An explicit `plugins:` slice always wins, which is the direction
 * this is moving in.
 */
export function pluginSlices(
  config: AmyConfig,
  profile: Profile,
  stateDir?: string,
  pluginNames?: ReadonlyMap<string, string>,
  composed?: { readonly name: string; readonly callees: readonly string[] },
): Record<string, unknown> {
  assertPhaseStateDirectoriesAreNotShared(config, profile);
  const dirs = stateDirectories(stateDir, profile);
  const own = pluginStateDirectories(stateDir, profile);
  const agent = effectiveAgent(config, profile);

  const derived = derivedSlices(config, profile, dirs, own, agent, stateDir);
  Object.assign(derived, slackSlice(own.slack), telegramSlice(own.telegram));
  addNotifySlices(config, derived);
  // The profile's own settings come first, and a slice written by hand wins
  // over them: that is the order the config always read in. The settings are
  // the workflow's vocabulary, checked against its configSchema at mount.
  applyOwnProfileSettings(profile, pluginNames ?? new Map(), derived);
  mergeInGivenSlices(derived, config.plugins);
  composedSlice(derived, composed);

  // The command that writes a file and the adapter that read it must agree,
  // including when somebody overrode the adapter's directory by hand. The
  // workflow's destination follows the effective adapter, not the default it
  // was derived from before the merge; the queue follows the queue adapter
  // the same way, because a note queued where the engine does not read is a
  // note the machine never sees.
  followAdapter(derived, "@amykit/workflow-errand", "tasksDirectory", "@amykit/plugin-file-tasks");
  followAdapter(derived, "@amykit/workflow-note-to-plan", "notesDirectory", "@amykit/plugin-file-notes");
  followAdapter(derived, "@amykit/workflow-errand", "queueDirectory", "@amykit/plugin-file-queue");
  followAdapter(derived, "@amykit/workflow-note-to-plan", "queueDirectory", "@amykit/plugin-file-queue");

  // The worktree adapter reads records directly to classify trees. Its path
  // is an invariant of the mounted file store, not an independent preference:
  // an explicit store directory must move both readers together.
  const recordsDirectory = effectiveRecordsDirectory(derived["@amykit/plugin-file-store"], stateDir, dirs.records);
  derived["@amykit/plugin-file-worktree"] = withWorktreeRecordsDirectory(
    derived["@amykit/plugin-file-worktree"],
    recordsDirectory,
  );

  return derived;
}

/** Whether a state directory was given in, or the machine's own. */
/**
 * The slices every install derives from the machine's shape, before a hand
 * writes a slice of its own.
 */
function derivedSlices(
  config: AmyConfig,
  profile: Profile,
  dirs: ReturnType<typeof stateDirectories>,
  own: ReturnType<typeof pluginStateDirectories>,
  agent: { ladder?: unknown; ladderByStep?: unknown; budget?: unknown },
  stateDir?: string,
): Record<string, unknown> {
  return {
    "@amykit/plugin-linear": {
      defaultRepo: config.repos[0] ?? "",
    },
    "@amykit/plugin-claude": harnessSlice(config, profile, "claude"),
    "@amykit/plugin-codex": harnessSlice(config, profile, "codex"),
    "@amykit/plugin-hermes-agent": harnessSlice(config, profile, "hermes"),
    "@amykit/plugin-agent-relay": {
      ladder: agent.ladder ?? [],
      ladderByStep: agent.ladderByStep ?? {},
      budget: agent.budget ?? {},
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
    "@amykit/plugin-file-brief-store": briefStoreSlice(config, profile),
    // One workflow writes the notes and another reads them, and an install
    // running only the first would still be filing the friction the second
    // is there to pick up. Where those notes go is wherever the plan
    // workflow's own profile says work happens.
    "@amykit/plugin-file-notes": notesSlice(config),
    // The second workflow's own vocabulary — which repositories it may write
    // a plan into — is the profile's, not the machine's top level's.
    "@amykit/workflow-note-to-plan": {
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
    },
    // The third workflow's vocabulary: where an errand may be done, and the
    // ceilings its decision function reads.
    "@amykit/workflow-errand": {
      repos: config.repos,
      // Where `amy btw` writes: the directory the file-tasks adapter reads.
      tasksDirectory: own.tasks,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
    },
    "@amykit/workflow-feature-grooming": {
      repos: config.repos,
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
    },
    // Phase-local, like the queue the tasks are put on: two phases of one
    // project mounting it must not drain each other's errands.
    "@amykit/plugin-file-tasks": {
      directory: own.tasks,
      repo: config.repos[0] ?? "",
    },
    "@amykit/plugin-plan-check": {
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      ...(commandsFromCheck(profile) === undefined ? {} : { commands: commandsFromCheck(profile) }),
    },
    // The workflow's own vocabulary: which repositories it counts review
    // load across, and who a review is answered for. The ceilings its
    // decisions read and the status a ticket moves to are the profile's.
    "@amykit/workflow-ticket-to-qa": {
      repos: config.repos,
      ...ticketBudgetSlice(config, profile),
      // Both halves of the layout, named the way the workflow's own schema
      // does: the branch a repository without a mapping is cut from, and the
      // map that names one. Derived here so no workflow package carries a
      // branch mapping of its own.
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      // Written under `agent:` in config.yaml, because it is how a reviewer
      // is answered, and read by the workflow whose review prompt it is.
      reviewerHints: reviewerHintsFor(config, profile),
    },
    // The workplace: where the trees live and how long finished ones stay.
    // `workflow` names the mount itself, because the tree paths carry it —
    // the profile's name is what the config calls this workflow, and two
    // profiles must never share a tree.
    "@amykit/plugin-file-worktree": {
      root: config.worktrees.root,
      workflow: worktreeNamespace(profile),
      recordsDirectory: worktreeRecordsDirectory(stateDir, dirs.records),
      defaultBranch: config.defaultBranch,
      baseBranch: config.baseBranch,
      checkouts: config.checkouts,
      retentionDays: config.worktrees.retentionDays,
    },
    // The engine's, and none of it names a domain. The concurrent engine is
    // the serial one with its lanes moved at once, and takes the same.
    "@amykit/plugin-serial-engine": engineSlice(config),
    "@amykit/plugin-concurrent-engine": engineSlice(config),
  };
}

/** A machine that asks for answers gets the adapters that deliver them. */
function addNotifySlices(config: AmyConfig, derived: Record<string, unknown>): void {
  if (config.notify.hermes) derived["@amykit/plugin-notify-hermes"] = { target: config.notify.hermes };
  if (config.notify.inbox) derived["@amykit/plugin-notify-inbox"] = { directory: "needs-input" };
}

// Merged per plugin, not replaced. A slice written by hand names the one
// or two settings somebody meant to change; replacing the whole slice would
// drop the derived ones beside them — which is how two profiles ended up
// sharing a queue, because the operator had set `retentionDays` and lost
// `directory` without being told.
function mergeInGivenSlices(derived: Record<string, unknown>, given: Record<string, unknown>): void {
  for (const [name, slice] of Object.entries(given)) {
    derived[name] = isRecord(derived[name]) && isRecord(slice) ? { ...derived[name], ...slice } : slice;
  }
}

// The profile's own settings are the workflow's vocabulary, checked against
// the workflow's own schema at mount: they beat what was derived, and an
// unknown key there is a boot refusal naming it. A workflow brought by spec
// can be named by its plugin differently — a local declaration without a
// plugin name answers to `workflow-oncall` — so the settings land on the
// name the mount reads the plugin by.
function applyOwnProfileSettings(
  profile: Profile,
  pluginNames: ReadonlyMap<string, string>,
  merged: Record<string, unknown>,
): void {
  const ownSettings = profile.settings ?? {};
  if (Object.keys(ownSettings).length === 0) return;
  const mountName = pluginNames.get(profile.workflow) ?? profile.workflow;
  const current = merged[mountName];
  merged[mountName] = isRecord(current) ? { ...current, ...ownSettings } : { ...ownSettings };
}

/**
 * The composed workflow's slice: the settings of the phases it walks, under
 * the one name the mount reads it by.
 *
 * A project's phases are called, not mounted, so their settings ride the
 * composed workflow's own config: each phase's derived slice is merged in,
 * and the composition splits it back out per call site. The machine's own
 * settings follow through the ordinary `applyOwnProfileSettings`.
 */
function composedSlice(derived: Record<string, unknown>, composed: { readonly name: string; readonly callees: readonly string[] } | undefined): void {
  if (!composed) return;
  const shared: Record<string, unknown> = {};
  for (const callee of composed.callees) {
    const slice = derived[callee];
    if (!isRecord(slice)) continue;
    mergeSlice(shared, slice);
  }
  // An entry the config wrote for the composed workflow itself survives the
  // composition: it was merged in as a given slice, and a thing written by
  // hand beats what was derived for the phases.
  const entry = derived[composed.name];
  const given: Record<string, unknown> = isRecord(entry) ? entry : {};
  mergeSlice(shared, given);
  derived[composed.name] = shared;
}

/** Merges phase slices by leaf, so sibling dotted settings reach their own callees. */
function mergeSlice(target: Record<string, unknown>, added: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(added)) {
    const current = target[key];
    if (isRecord(current) && isRecord(value)) mergeSlice(current, value);
    else target[key] = value;
  }
}

/**
 * The repositories the machine's notes are about, taken from the profiles
 * that turn a note into a plan.
 *
 * The notes directory is the machine's — one workflow writes a failure and
 * another reads it — so the destinations are read off every profile that
 * mounts the plan workflow, wherever in the config they now live, and an
 * install with none of them files nothing.
 */
function notesDestinations(config: AmyConfig): readonly string[] {
  const repos = new Set<string>();
  for (const one of Object.values(config.workflows)) {
    if (one.workflow !== "@amykit/workflow-note-to-plan") continue;
    const declared = one.settings?.repos;
    if (Array.isArray(declared)) {
      for (const repo of declared) if (typeof repo === "string") repos.add(repo);
    }
  }
  return [...repos];
}

function notesSlice(config: AmyConfig): Record<string, unknown> {
  const destinations = notesDestinations(config);
  return {
    directory: "notes",
    repo: destinations[0] ?? "",
    writeFailureNotes: destinations.length > 0,
  };
}

/** The plan check a profile names for its own workflow, or nothing for the default. */
function commandsFromCheck(profile: Profile): Record<string, unknown> | undefined {
  const check = (profile.settings ?? {}).check;
  return isRecord(check) ? check : undefined;
}

/** Global state-directory overrides have no profile slot, so a project's mounts cannot safely share one. */
function assertPhaseStateDirectoriesAreNotShared(config: AmyConfig, profile: Profile): void {
  if (!profile.project) return;
  for (const plugin of [
    "@amykit/plugin-file-queue",
    "@amykit/plugin-file-store",
    "@amykit/plugin-file-brief-store",
    "@amykit/plugin-file-tasks",
    "@amykit/plugin-slack",
    "@amykit/plugin-telegram",
  ] as const) {
    // Telegram is never recommended, so a project that does not name it does not mount it, and a
    // directory set for an ordinary profile's Telegram is not this project's to refuse.
    if (plugin === "@amykit/plugin-telegram" && !pluginList(config, profile).includes(plugin)) continue;
    const slice = config.plugins[plugin];
    if (isRecord(slice) && typeof slice.directory === "string") {
      throw new Error(`${plugin}.directory is shared across profiles and cannot be overridden for a project`);
    }
  }
  const worktree = config.plugins["@amykit/plugin-file-worktree"];
  if (isRecord(worktree) && typeof worktree.workflow === "string") {
    throw new Error("@amykit/plugin-file-worktree.workflow is shared across profiles and cannot be overridden for a project");
  }
}

function stateDirectories(stateDir: string | undefined, profile: Profile): { records: string; queue: string } {
  if (!stateDir) return directoriesFor(profile);
  const place = profilePaths(stateDir, profile);
  return {
    records: path.relative(stateDir, place.records),
    queue: path.relative(stateDir, place.queue),
  };
}

/** The threads a phase opened are its own; an ordinary profile's slice stays as it was. */
function slackSlice(directory: string): Record<string, unknown> {
  return directory === "slack" ? {} : { "@amykit/plugin-slack": { directory } };
}

/** The topics a phase opened are its own, as its threads are; an ordinary profile's slice stays as it was. */
function telegramSlice(directory: string): Record<string, unknown> {
  return directory === "telegram" ? {} : { "@amykit/plugin-telegram": { directory } };
}

/** Plugin-owned state directories, relative to the state root the plugin is handed. */
function pluginStateDirectories(stateDir: string | undefined, profile: Profile): { tasks: string; slack: string; telegram: string } {
  if (!stateDir) {
    const base = profile.project ? `${projectStateKey(profile.project, profile.name)}/` : "";
    return { tasks: `${base}tasks`, slack: `${base}slack`, telegram: `${base}telegram` };
  }
  const place = profilePaths(stateDir, profile);
  return {
    tasks: path.relative(stateDir, place.tasks),
    slack: path.relative(stateDir, place.slack),
    telegram: path.relative(stateDir, place.telegram),
  };
}

/** A checkout belongs to the project and its configured profile: one namespace, not one per phase. */
export function worktreeNamespace(profile: Profile): string {
  return profile.project ? projectStateKey(profile.project, profile.name) : profile.name;
}

/** The worktree adapter reads the same absolute records directory as the file store. */
function worktreeRecordsDirectory(stateDir: string | undefined, recordsDirectory: string): string {
  // The file-store provider deliberately treats its setting as a state-root
  // relative directory, even when it begins with a slash. Keep its reader on
  // that exact path rather than giving this sibling adapter path.resolve's
  // different absolute-path semantics.
  return stateDir ? path.join(stateDir, recordsDirectory) : "";
}

/** Resolve the file store's final configured directory after explicit slices win. */
function effectiveRecordsDirectory(slice: unknown, stateDir: string | undefined, fallback: string): string {
  const directory = isRecord(slice) && typeof slice.directory === "string" ? slice.directory : fallback;
  return worktreeRecordsDirectory(stateDir, directory);
}

/** Keep a valid worktree slice coupled to the mounted record store. */
function withWorktreeRecordsDirectory(slice: unknown, recordsDirectory: string): unknown {
  return isRecord(slice) ? { ...slice, recordsDirectory } : slice;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The profile can narrow cost and model choices without changing any other host setting. */
/** The reviewer hints written under `agent:`, for the workflow whose review prompt they are. */
function reviewerHintsFor(config: AmyConfig, profile: Profile): Record<string, string> {
  return effectiveAgent(config, profile).reviewerHints ?? {};
}

function effectiveAgent(config: AmyConfig, profile: Profile): AmyConfig["agent"] {
  return { ...config.agent, ...(profile.agent ?? {}) };
}

function ticketBudgetSlice(config: AmyConfig, profile: Profile): { budget: Record<string, unknown> } {
  return { budget: effectiveAgent(config, profile).budget ?? {} };
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
function briefStoreSlice(config: AmyConfig, profile: Profile): { directory: string } {
  // Project phases share a host-owned artifact root. Ordinary profiles retain
  // the file-store translation, including an explicit path they already use.
  return { directory: profile.project ? "briefs" : legacyBriefDirectory(config) };
}

/** Where an ordinary profile keeps its briefs, relative to the state directory. */
function legacyBriefDirectory(config: AmyConfig): string {
  const own = config.plugins["@amykit/plugin-file-brief-store"];
  if (isRecord(own) && typeof own.directory === "string") return own.directory;
  return fileStoreBriefDirectory(config) ?? "briefs";
}

/**
 * The settings a harness plugin gets.
 *
 * The tiers come from the ladder rather than from a second list, so there is
 * one place to edit. `claude:sonnet, claude:opus` in the ladder is what makes
 * the claude plugin contribute two agents, and the relay then finds both
 * names it was told to try.
 */
function harnessSlice(config: AmyConfig, profile: Profile, harness: string): Record<string, unknown> {
  const agent = effectiveAgent(config, profile);
  const fromLadder = tiersFor(everyLadderEntry(agent), harness);

  // A harness is told how to run and nothing about where work lives: the
  // agent only answers, in the directory its caller hands it.
  return {
    model: agent.model ?? "",
    models: fromLadder.length > 0 ? fromLadder : (agent.models ?? []),
    ...(agent.timeoutMs === undefined ? {} : { timeoutMs: agent.timeoutMs }),
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
function everyLadderEntry(agent: AmyConfig["agent"]): string[] {
  return [
    ...(agent.ladder ?? []),
    ...Object.values(agent.ladderByStep ?? {}).flat(),
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

  const ladder = everyLadderEntry(effectiveAgent(config, profile));

  // A channel nobody configured should not be mounted, or the fan-out would
  // announce into a target that is not there. Same reasoning for a harness:
  // mounting one whose binary is not installed only produces a doctor failure
  // for a tool the operator never asked for.
  const recommended = recommendedFor(profile).filter((name) => {
    // A note needs somewhere to go. An install that named no repository to
    // write plans into would be watching a directory nothing could ever come
    // out of, so it does not watch one. Where those destinations are named
    // now lives under the plan workflow's own profile.
    if (name === "@amykit/plugin-file-notes") return notesDestinations(config).length > 0;
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
export function hostPaths(config: AmyConfig, stateDir: string, profile?: Profile) {
  const place = profile ? profilePaths(stateDir, profile) : undefined;
  return {
    workspace: path.resolve(config.workspaceRoot),
    checkouts: config.checkouts,
    state: stateDir,
    ...(place ? { profile: path.dirname(place.records) } : {}),
    ...(place?.artifacts ? { artifacts: place.artifacts } : {}),
  };
}

function engineSlice(config: AmyConfig): Record<string, unknown> {
  return {
    staleClaimMs: config.staleClaimMs,
    retentionDays: config.retentionDays,
    maxItemAttempts: config.maxItemAttempts,
    // No retryDelayMs here: how quickly the engine comes back to a failed
    // item is the engine's own answer, declared and defaulted in its schema.
    // It was once a ticket workflow's review poll, which is how tuning how
    // often a review is looked at moved how the whole machine retried.
  };
}

/** Points a workflow's destination at the directory its adapter ended up with. */
function followAdapter(
  merged: Record<string, unknown>,
  workflow: string,
  setting: string,
  adapter: string,
): void {
  const slice = merged[workflow];
  const from = merged[adapter];
  if (!isRecord(slice) || !isRecord(from) || typeof from.directory !== "string") return;
  merged[workflow] = { ...slice, [setting]: from.directory };
}
