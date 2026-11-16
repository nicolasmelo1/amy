import path from "node:path";
import { Check, CommandRunner } from "@amykit/core";

/**
 * What the profile amy runs in has switched off, and why each one.
 *
 * `-z` bypasses approvals, so in the operator's own Hermes a ticket run read
 * their memory and wrote what it learned back: memories, and skills patched
 * or created, with nobody asked. In amy's profile the run remembers nothing,
 * a skill it wants to write waits for a person, and the curator does not
 * rework skills between runs.
 */
export interface ProfileSetting {
  readonly key: string;
  readonly value: string;
  readonly says: string;
}

export const PROFILE_SETTINGS: readonly ProfileSetting[] = [
  { key: "memory.memory_enabled", value: "false", says: "remembers between runs" },
  { key: "memory.user_profile_enabled", value: "false", says: "keeps a profile of the user" },
  { key: "skills.write_approval", value: "true", says: "writes skills unasked" },
  { key: "curator.enabled", value: "false", says: "curates skills between runs" },
];

/** amy's own skill root, the one the relay installs into and lends from. */
export function amySkillRoot(state: string): string {
  return path.join(state, "skills");
}

/**
 * The profile setting that lets a run see amy's skills by name.
 *
 * `-s` resolves a skill through the roots Hermes scans, so the directory amy
 * owns has to be one of them. Written as a YAML list, which is how
 * `skills.external_dirs` is read, and checked by the doctor like the rest.
 */
export function externalDirsSetting(skillRoot: string): ProfileSetting {
  return { key: "skills.external_dirs", value: JSON.stringify([skillRoot]), says: "does not name amy's skills" };
}

const DESCRIPTION = "amy's runs: one-shot ticket work that keeps no memory and writes no skill unasked";

/**
 * Makes the profile amy runs in, once.
 *
 * Cloned from the active profile, which carries the model, the provider keys
 * and the skills; Hermes reads the login through its credential pool, so the
 * clone needs no second sign-in. A profile that exists is left alone: what is
 * in it is whoever edited it, and the doctor is what says when it drifted.
 */
export async function prepareProfile(runner: CommandRunner, profile: string, skillRoot: string): Promise<Check> {
  const label = `hermes profile ${profile}`;
  if (await exists(runner, profile)) return { label, ok: true, detail: "kept: it already exists" };

  const created = await runner.run("hermes", ["profile", "create", profile, "--clone", "--no-alias", "--description", DESCRIPTION]);
  if (!created.ok) return { label, ok: false, detail: failure("could not create it", created) };

  for (const setting of [...PROFILE_SETTINGS, externalDirsSetting(skillRoot)]) {
    const set = await runner.run("hermes", ["-p", profile, "config", "set", setting.key, setting.value]);
    if (!set.ok) return { label, ok: false, detail: failure(`created it, but could not set ${setting.key}`, set) };
  }

  return { label, ok: true, detail: "created from the active profile, with memory, amy's skill root, unasked skill writes and the curator off" };
}

/**
 * Whether the profile exists and still has off what amy turned off.
 *
 * Red names the command that puts each one back, rather than putting it back:
 * somebody turned it on, and the doctor is not the place to overrule them.
 */
export async function checkProfile(runner: CommandRunner, profile: string, skillRoot: string): Promise<Check> {
  const label = `hermes profile ${profile}`;
  if (!(await exists(runner, profile))) {
    // Only the plugin's own setup: a bare clone copies the active profile's settings, so
    // it would come back remembering and curating, and the doctor still red.
    return { label, ok: false, detail: "missing: run `amy setup hermes`, which creates it with memory, amy's skill root, unasked skill writes and the curator off" };
  }

  const drifted: string[] = [];
  for (const setting of [...PROFILE_SETTINGS, externalDirsSetting(skillRoot)]) {
    const got = await runner.run("hermes", ["-p", profile, "config", "get", setting.key]);
    if (!holds(setting, got.stdout, skillRoot)) {
      const value = setting.key === "skills.external_dirs" ? `'${setting.value}'` : setting.value;
      drifted.push(`${setting.says} (\`hermes -p ${profile} config set ${setting.key} ${value}\`)`);
    }
  }

  return drifted.length === 0
    ? { label, ok: true }
    : { label, ok: false, detail: `the profile ${drifted.join("; ")}` };
}

/** Whether the profile still holds what amy set: a scalar verbatim, a list by its entry. */
function holds(setting: ProfileSetting, stdout: string, skillRoot: string): boolean {
  if (setting.key === "skills.external_dirs") return stdout.includes(skillRoot);
  return stdout.trim().toLowerCase() === setting.value;
}

async function exists(runner: CommandRunner, profile: string): Promise<boolean> {
  return (await runner.run("hermes", ["profile", "show", profile])).ok;
}

function failure(what: string, result: { stdout: string; stderr: string; exitCode: number | null }): string {
  const said = (result.stderr || result.stdout).trim();
  return said ? `${what}: ${said}` : `${what} (exit ${result.exitCode})`;
}
