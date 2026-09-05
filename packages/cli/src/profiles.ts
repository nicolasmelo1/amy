import type { AmyConfig, WorkflowProfile } from "./config.js";

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
  /** Whether `amy note` files friction onto this profile's queue. */
  readonly takesNotes: boolean;
  /** Whether `amy btw` puts a task onto this profile's queue. */
  readonly takesTasks: boolean;
}

/**
 * What a fresh install can drive, before anybody writes a `workflows:` block.
 *
 * Two entries rather than two special cases: a config that names either one
 * replaces it, and a config that names a third gets a third. Nothing else in
 * the CLI reads these names.
 */
export const SHIPPED_PROFILES: Record<string, WorkflowProfile> = {
  "ticket-to-qa": { workflow: "@amy/workflow-ticket-to-qa" },
  "note-to-plan": { workflow: "@amy/workflow-note-to-plan", notes: true },
  errand: { workflow: "@amy/workflow-errand", tasks: true },
};

/**
 * What every profile mounts, whichever workflow is driving.
 *
 * This list is the point of the whole plugin model: the queue, the store, the
 * notes, the forge, the harnesses, the relay that composes them, the ceiling
 * it carries, every notification channel, and the engine. Not one of them is
 * duplicated for a second workflow, and not one changed to take it.
 */
const SHARED: readonly string[] = [
  "@amy/plugin-file-queue",
  "@amy/plugin-file-store",
  "@amy/plugin-file-notes",
  "@amy/plugin-github",
  "@amy/plugin-claude",
  "@amy/plugin-codex",
  "@amy/plugin-hermes-agent",
  // The only thing that mounts the `agent` port. The harnesses above merely
  // contribute themselves to it, so dropping this from a config leaves every
  // agent action without a port and the mount is refused at boot.
  "@amy/plugin-agent-relay",
  "@amy/plugin-notify-fanout",
  "@amy/plugin-notify-hermes",
  "@amy/plugin-notify-inbox",
  "@amy/plugin-serial-engine",
];

/**
 * What a shipped workflow needs beside the shared set.
 *
 * Keyed by the workflow package rather than by the profile name: what a
 * workflow depends on travels with the workflow, so renaming a profile in a
 * config changes nothing about what mounts under it.
 */
const NEEDS: Record<string, readonly string[]> = {
  "@amy/workflow-ticket-to-qa": ["@amy/plugin-linear", "@amy/plugin-command-gate"],
  "@amy/workflow-note-to-plan": ["@amy/plugin-plan-check"],
  "@amy/workflow-errand": ["@amy/plugin-file-tasks"],
};

/** What `amy init` suggests installing for a profile that lists nothing. */
export function recommendedFor(profile: Profile): readonly string[] {
  return [profile.workflow, ...SHARED, ...(NEEDS[profile.workflow] ?? [])];
}

/** Every profile this install can drive: the shipped ones, plus the config's. */
export function profiles(config: AmyConfig): Record<string, Profile> {
  const declared = { ...SHIPPED_PROFILES, ...config.workflows };
  const resolved: Record<string, Profile> = {};

  for (const [name, entry] of Object.entries(declared)) {
    resolved[name] = {
      name,
      workflow: entry.workflow,
      plugins: entry.plugins ?? [],
      takesNotes: entry.notes ?? false,
      takesTasks: entry.tasks ?? false,
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
export function resolveProfile(config: AmyConfig, asked?: string): Resolution {
  const known = profiles(config);
  const names = Object.keys(known);
  const wanted = (asked ?? config.defaultWorkflow ?? "").trim() || names[0];

  if (!wanted) {
    return { ok: false, problem: "no workflow is configured, so there is nothing to drive" };
  }

  const profile = known[wanted];
  if (!profile) {
    return { ok: false, problem: `there is no \`${wanted}\` workflow. Try: ${names.join(", ")}` };
  }

  return { ok: true, profile };
}

/**
 * Where a profile keeps its records and its queue, under one `.amy`.
 *
 * One directory per profile, named after it, so a second workflow never
 * writes over the first's state — swapping which one you drive keeps both.
 * Everything else under `.amy` stays shared: one log means one budget, and
 * one handbrake means `amy stop` stops whichever workflow is running.
 */
export function directoriesFor(profile: string): { records: string; queue: string } {
  return { records: `${profile}/records`, queue: `${profile}/queue` };
}

/** The layout a version before profiles-as-data wrote, and where it went. */
export const LEGACY_DIRECTORIES: Record<string, string> = {
  tickets: "ticket-to-qa/records",
  queue: "ticket-to-qa/queue",
  plans: "note-to-plan/records",
  "plan-queue": "note-to-plan/queue",
};
