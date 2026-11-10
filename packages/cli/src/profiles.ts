import { createHash } from "node:crypto";
import path from "node:path";
import type { AmyConfig, WorkflowProfile } from "./config.js";

/**
 * The phase folders a project may carry, in walk order: the brief's, the
 * work's and the proving one's. A folder named any of these is a phase of
 * the project its parent folder is; the walk of the project calls the
 * workflows its folders export.
 */
export const PROJECT_PHASES = ["brief", "workflow", "prove"] as const;
type ProjectPhase = (typeof PROJECT_PHASES)[number];

/**
 * A project, inferred from the folder a phase spec names.
 *
 * `project` is the whole project's identity — the root directory its phases
 * walk, not a case in a switch — and the phase the spec named, which tells a
 * refusal which folder was expected to say so.
 */
export interface ProjectIdentity {
  readonly root: string;
  readonly phase: ProjectPhase;
}

/**
 * Which workflow this invocation drives.
 *
 * A profile is a name in the config, not a case in a switch. `amy --workflow
 * oncall` works the moment a config declares `oncall`, because nothing here
 * enumerates what is allowed: the table below is what a config with no
 * `workflows:` block gets, which is a default rather than an inventory.
 *
 * One workflow per invocation, because `mount()` claims a single one. What is
 * shared is everything that matters — the same engine, the same log and
 * therefore the same budget, the same relay, the same forge, one handbrake.
 */
export interface Profile {
  /** What is typed after `--workflow`, and the directory its state lives in. */
  readonly name: string;
  /** The package contributing `plan()` and the runtime that answers it. */
  readonly workflow: string;
  /** What to mount. Empty means the recommended set for this workflow. */
  readonly plugins: readonly string[];
  /** The brief provider this profile explicitly chose, if any. */
  readonly briefStore?: string;
  /** Whether `amy note` files friction onto this profile's queue. */
  readonly takesNotes: boolean;
  /** Whether `amy btw` puts a task onto this profile's queue. */
  readonly takesTasks: boolean;
  /** The project artifact boundary inferred from a phase directory. */
  readonly project?: ProjectIdentity;
  /** Per-profile model and budget overrides, merged by the CLI before mount. */
  readonly agent?: WorkflowProfile["agent"];
  /**
   * The workflow's own settings, checked against its configSchema at mount.
   *
   * Whatever the profile drives may tune here — the ceilings its decisions
   * read, the status its tracker hands work to — and everything else it takes
   * from the machine's top level or its own schema's defaults.
   */
  readonly settings: Readonly<Record<string, unknown>>;
}

/**
 * What a fresh install can drive, before anybody writes a `workflows:` block.
 *
 * Nothing: the machine that arrives carries no process, and the first one on
 * it is the one the person there names or writes. `amy workflow new` and
 * `amy add` both end in a config block, which is the only place a profile
 * has ever come from.
 */
const SHIPPED_PROFILES: Record<string, WorkflowProfile> = {};

/**
 * What every profile mounts, whichever workflow is driving.
 *
 * This list is the point of the whole plugin model: the queue, the store, the
 * notes, the forge, the harnesses, the relay that composes them, the ceiling
 * it carries, every notification channel, and the engine. Not one of them is
 * duplicated for a second workflow, and not one changed to take it.
 */
const PROVIDERS: readonly string[] = [
  "@amykit/plugin-file-queue",
  "@amykit/plugin-file-store",
  // A BriefStore is intentionally its own mount: a Git-backed adapter can
  // replace this local default without the record store claiming its port.
  "@amykit/plugin-file-brief-store",
  "@amykit/plugin-file-notes",
  "@amykit/plugin-github",
];

/** Mount after the workflow declares terminal states, before its consumers capture Git. */
const WORKTREE_AND_CONSUMERS: readonly string[] = [
  "@amykit/plugin-file-worktree",
  "@amykit/plugin-claude",
  "@amykit/plugin-codex",
  "@amykit/plugin-hermes-agent",
  // The only thing that mounts the `agent` port. The harnesses above merely
  // contribute themselves to it, so dropping this from a config leaves every
  // agent action without a port and the mount is refused at boot.
  "@amykit/plugin-agent-relay",
  "@amykit/plugin-notify-fanout",
  "@amykit/plugin-notify-hermes",
  "@amykit/plugin-notify-inbox",
  "@amykit/plugin-serial-engine",
];

/**
 * What a shipped workflow needs beside the shared set.
 *
 * Keyed by the workflow package rather than by the profile name: what a
 * workflow depends on travels with the workflow, so renaming a profile in a
 * config changes nothing about what mounts under it.
 */
const NEEDS: Record<string, readonly string[]> = {
  "@amykit/workflow-ticket-to-qa": ["@amykit/plugin-linear", "@amykit/plugin-command-gate"],
  "@amykit/workflow-note-to-plan": ["@amykit/plugin-plan-check"],
  "@amykit/workflow-errand": ["@amykit/plugin-file-tasks"],
  "@amykit/workflow-feature-grooming": ["@amykit/plugin-linear"],
  "@amykit/workflow-setup": ["@amykit/plugin-terminal-conversation"],
};

/** What `amy add` installs for a profile that lists nothing. */
export function recommendedFor(profile: Profile): readonly string[] {
  return recommendedPluginsFor(profile.workflow);
}

/** What a workflow would mount, named by its spec: the recommendation the boot would read. */
function recommendedPluginsFor(workflow: string): readonly string[] {
  const needs = NEEDS[workflow] ?? [];
  // Workflow ports need their providers during registration, while the
  // worktree captures the workflow's terminal states and must follow it.
  const prerequisites = needs.filter((plugin) => plugin === "@amykit/plugin-linear");
  const consumers = needs.filter((plugin) => plugin !== "@amykit/plugin-linear");
  return [...PROVIDERS, ...prerequisites, workflow, ...WORKTREE_AND_CONSUMERS, ...consumers];
}

/** Every profile this install can drive: the shipped ones, plus the config's. */
export function profiles(config: AmyConfig, home?: string): Record<string, Profile> {
  const declared = { ...SHIPPED_PROFILES, ...config.workflows };
  // Profile names come from configuration. A null prototype makes every
  // accepted name an own entry rather than inheriting Object's vocabulary.
  const resolved = Object.create(null) as Record<string, Profile>;

  for (const [name, entry] of Object.entries(declared)) {
    assertProfileName(name);
    const workflow = filesystemWorkflow(home, entry.workflow);
    resolved[name] = {
      name,
      workflow,
      // The configured spelling remains in config, but the plugin loader and
      // the required-workflow check must agree on the live absolute spec.
      plugins: (entry.plugins ?? []).map((plugin) => plugin === entry.workflow ? workflow : plugin),
      briefStore: entry.briefStore,
      takesNotes: entry.notes ?? false,
      takesTasks: entry.tasks ?? false,
      project: projectFor(workflow),
      agent: entry.agent,
      settings: entry.settings ?? {},
    };
  }

  // A project is one profile and one daemon: its phases are child records of
  // the project's record, walked in the one walk the project's workflow
  // declares. Two profiles naming one project would run the same walk twice,
  // and the second would find the work of the first already under way.
  const roots = new Map<string, string[]>();
  for (const [name, profile] of Object.entries(resolved)) {
    if (!profile.project) continue;
    const names = roots.get(profile.project.root) ?? [];
    names.push(name);
    roots.set(profile.project.root, names);
  }
  for (const [root, names] of roots) {
    if (names.length < 2) continue;
    throw new Error(
      `the project at ${root} is one profile: ${names.map((name) => `\`${name}\``).join(" and ")} both name it — a project walks its phases as child records of one profile, so fold them into the one entry naming its workflow/ (the update's migration folds such a config)`,
    );
  }

  return resolved;
}

export type Resolution = { ok: true; profile: Profile } | { ok: false; problem: string };

/**
 * The profile a name asks for, or why there is none.
 *
 * A name nobody declared is refused with the list of names there were, which
 * is the difference between a typo you can fix and a command that does
 * nothing. No name at all takes `defaultWorkflow`, and then the first one
 * declared, so an install with one workflow never has to name it.
 */
export function resolveProfile(config: AmyConfig, asked?: string, home?: string): Resolution {
  const known = profiles(config, home);
  const names = Object.keys(known);
  const wanted = (asked ?? config.defaultWorkflow ?? "").trim() || names[0];

  if (!wanted) {
    return {
      ok: false,
      problem:
        "no workflow is configured, so there is nothing to drive — `amy workflow new` writes one, `amy add` names an existing package",
    };
  }

  const profile = known[wanted];
  if (!profile) {
    return { ok: false, problem: `there is no \`${wanted}\` workflow. Try: ${names.join(", ")}` };
  }

  // A config that names a `test/` folder as its workflow is the legacy
  // proving-phase anchor, and it is refused with the rename: under the
  // project vocabulary the proving phase is `prove/`, and a `test/` spec
  // would otherwise mount as an ordinary workflow without a word about it.
  const spec = filesystemWorkflow(home, profile.workflow);
  if (path.basename(spec) === "test") {
    return {
      ok: false,
      problem: `\`${profile.workflow}\` is the old proving phase's folder, and the phase is named \`prove/\` now — rename the folder to \`prove/\`, or name another workflow`,
    };
  }

  return { ok: true, profile };
}

/** Resolve a portable filesystem spec only while constructing its live profile. */
function filesystemWorkflow(home: string | undefined, workflow: string): string {
  // The home resolves a workflow-of-your-own; a package named by spec comes
  // through untouched, with or without a home to resolve against.
  return workflow.startsWith(".") && home ? path.resolve(home, workflow) : workflow;
}

/**
 * Where a project keeps its records and its queue, under one `.amy`.
 *
 * A project is one profile now: its phases are child records of the
 * project's record, not profiles of their own, so every phase shares the
 * one state key the project has. Everything else under `.amy` stays shared:
 * one log means one budget, and one handbrake means `amy stop` stops the
 * project's daemon.
 */
export function directoriesFor(profile: string | Pick<Profile, "name" | "project">): { records: string; queue: string } {
  if (typeof profile !== "string" && profile.project) {
    const base = projectStateKey(profile.project, profile.name);
    return { records: `${base}/records`, queue: `${base}/queue` };
  }
  const name = typeof profile === "string" ? profile : profile.name;
  return { records: `${name}/records`, queue: `${name}/queue` };
}

/**
 * The shared project root is inferred from a phase directory, never from `..`
 * configuration. Every `brief/`, `workflow/` or `prove/` is a phase, alone or
 * not: a folder a project lacks is a part of the work nobody drives.
 */
function projectFor(workflow: string): ProjectIdentity | undefined {
  if (!workflow.startsWith(".") && !path.isAbsolute(workflow)) return undefined;
  const phase = path.basename(workflow) as ProjectPhase;
  if (!PROJECT_PHASES.includes(phase)) return undefined;
  return { root: path.resolve(workflow, ".."), phase };
}

/** A stable, path-safe state name that cannot make a profile leave Amy home. */
export function projectStateKey(project: ProjectIdentity, profile?: string): string {
  return `${projectRootKey(project)}${profile ? `/${profile}` : ""}`;
}

/** A profile name becomes part of its state path, so it has one safe component. */
function assertProfileName(name: string): void {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || path.win32.basename(name) !== name) {
    throw new Error(`a workflow profile name must be one path component: \`${name}\``);
  }
}

/** The project-owned state root; phase names are appended only by the host. */
function projectRootKey(project: ProjectIdentity): string {
  const safe = createHash("sha256").update(project.root).digest("base64url");
  return `projects/${safe}`;
}

/** The one directory the project's phases share; its state stays the project's alone. */
export function artifactDirectory(profile: Pick<Profile, "project">): string | undefined {
  return profile.project ? `${projectRootKey(profile.project)}/artifacts` : undefined;
}

/**
 * The layout a version before profiles-as-data wrote, and where it went.
 *
 * The old names were the shipped profiles: `ticket-to-qa` under its own
 * directory and the two beside it. A config may declare any of those names
 * again, so the mapping only fires for a directory the config does not
 * declare — a name somebody chose is theirs, not this table's.
 */
export const LEGACY_DIRECTORIES: Record<string, string> = {
  tickets: "ticket-to-qa/records",
  queue: "ticket-to-qa/queue",
  plans: "note-to-plan/records",
  "plan-queue": "note-to-plan/queue",
};
