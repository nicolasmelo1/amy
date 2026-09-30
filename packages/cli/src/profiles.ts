import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AmyConfig, WorkflowProfile } from "./config.js";

const PROJECT_PHASES = ["brief", "workflow", "test"] as const;
type ProjectPhase = (typeof PROJECT_PHASES)[number];

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
};

/** What `amy init` suggests installing for a profile that lists nothing. */
export function recommendedFor(profile: Profile): readonly string[] {
  const needs = NEEDS[profile.workflow] ?? [];
  // Workflow ports need their providers during registration, while the
  // worktree captures the workflow's terminal states and must follow it.
  const prerequisites = needs.filter((plugin) => plugin === "@amykit/plugin-linear");
  const consumers = needs.filter((plugin) => plugin !== "@amykit/plugin-linear");
  return [...PROVIDERS, ...prerequisites, profile.workflow, ...WORKTREE_AND_CONSUMERS, ...consumers];
}

/** Every profile this install can drive: the shipped ones, plus the config's. */
export function profiles(config: AmyConfig, home?: string): Record<string, Profile> {
  const declared = { ...SHIPPED_PROFILES, ...config.workflows };
  const resolved: Record<string, Profile> = {};

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
      project: projectFor(workflow, Object.values(declared).map((candidate) => filesystemWorkflow(home, candidate.workflow)), home, name),
      agent: entry.agent,
    };
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

  return { ok: true, profile };
}

/** Resolve a portable filesystem spec only while constructing its live profile. */
function filesystemWorkflow(home: string | undefined, workflow: string): string {
  return home && workflow.startsWith(".") ? path.resolve(home, workflow) : workflow;
}

/**
 * Where a profile keeps its records and its queue, under one `.amy`.
 *
 * One directory per profile, named after it, so a second workflow never
 * writes over the first's state — swapping which one you drive keeps both.
 * Everything else under `.amy` stays shared: one log means one budget, and
 * one handbrake means `amy stop` stops whichever workflow is running.
 */
export function directoriesFor(profile: string | Pick<Profile, "name" | "project">): { records: string; queue: string } {
  if (typeof profile !== "string" && profile.project) {
    const base = projectStateKey(profile.project, profile.name);
    return { records: `${base}/records`, queue: `${base}/queue` };
  }
  const name = typeof profile === "string" ? profile : profile.name;
  return { records: `${name}/records`, queue: `${name}/queue` };
}

/** The shared project root is inferred from a phase package, never from `..` configuration. */
function projectFor(workflow: string, configured: readonly string[], home?: string, name?: string): ProjectIdentity | undefined {
  if (!workflow.startsWith(".") && !path.isAbsolute(workflow)) return undefined;
  const phase = path.basename(workflow) as ProjectPhase;
  if (!PROJECT_PHASES.includes(phase)) return undefined;
  const root = path.resolve(workflow, "..");
  // A lone `workflow/` is a long-supported ordinary profile. A solitary
  // `brief/` or `test/` is still a phase: it must get phase-local state and
  // fail the configured-workflow check rather than silently becoming legacy.
  const phases = new Set(configured
    .filter((candidate) => candidate.startsWith(".") || path.isAbsolute(candidate))
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => path.dirname(candidate) === root)
    .map((candidate) => path.basename(candidate))
    .filter((candidate): candidate is ProjectPhase => PROJECT_PHASES.includes(candidate as ProjectPhase)));
  const identity = { root, phase };
  // A previously active phase keeps its identity when config edits leave its
  // workflow directory alone. A fresh lone workflow remains legacy.
  const keptPhaseState = home !== undefined && name !== undefined && fs.existsSync(path.join(home, projectStateKey(identity, name)));
  return phase !== "workflow" || phases.size > 1 || keptPhaseState ? identity : undefined;
}

/** A stable, path-safe state name that cannot make a profile leave Amy home. */
export function projectStateKey(project: ProjectIdentity, profile?: string): string {
  return `${projectRootKey(project)}${profile ? `/${profile}` : ""}/${project.phase}`;
}

/** A profile name becomes part of its state path, so it has one safe component. */
function assertProfileName(name: string): void {
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || path.win32.basename(name) !== name) {
    throw new Error(`a workflow profile name must be one path component: \`${name}\``);
  }
}

/** The project-owned state root; phase names are appended only by the host. */
function projectRootKey(project: ProjectIdentity): string {
  const safe = createHash("sha256").update(project.root).digest("base64url");
  return `projects/${safe}`;
}

/** The one directory phases share; queues, records and budgets remain phase-local. */
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
