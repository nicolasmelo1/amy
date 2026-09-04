/**
 * Which workflow this invocation drives.
 *
 * One workflow per host, because `mount()` claims a single one and that has
 * not changed: an install that drove two at once would need two of everything
 * the core claims exactly one of. What is shared instead is everything that
 * matters — the same engine, the same queue and store implementations, the
 * same event log and therefore the same budget, the same relay and the same
 * forge. Two profiles over one `.amy`, not two installs.
 */
export const PROFILES = ["ticket-to-qa", "note-to-plan"] as const;

export type Profile = (typeof PROFILES)[number];

export const DEFAULT_PROFILE: Profile = "ticket-to-qa";

export function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value);
}

/**
 * Where each profile keeps its records and its queue, under one `.amy`.
 *
 * Two directories rather than two roots, so `.amy/log` is one file that both
 * profiles append to. That is what makes "the same budget" a fact rather than
 * a claim: the ceiling is measured off the log, and there is one.
 */
export function directoriesFor(profile: Profile): { records: string; queue: string } {
  return profile === "note-to-plan"
    ? { records: "plans", queue: "plan-queue" }
    : { records: "tickets", queue: "queue" };
}
