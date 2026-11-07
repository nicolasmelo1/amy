import path from "node:path";
import { Profile, artifactDirectory, directoriesFor, projectStateKey } from "./profiles.js";

/**
 * What every profile shares, under one state directory.
 *
 * The config, the log, the handbrake, the notes and the inbox are shared on
 * purpose. One log means one budget, and one handbrake means
 * `amy pause` stops the machine rather than the workflow you happened to name.
 */
export function paths(home: string) {
  return {
    base: home,
    config: path.join(home, "config.yaml"),
    notes: path.join(home, "notes"),
    needsInput: path.join(home, "needs-input"),
    log: path.join(home, "log"),
    stop: path.join(home, "PAUSED"),
    /** Written by the daemon, so a second one refuses rather than doubles up. */
    pid: path.join(home, "daemon.pid"),
    /**
     * The npm root amy's plugins are installed into and resolved from.
     *
     * Part of the state like everything else here, so `AMY_HOME` moves it with
     * the rest: a plugin follows its machine's state directory, not a global
     * prefix shared with whatever else npm has put there.
     */
    plugins: path.join(home, "plugins"),
  };
}

/**
 * The npm root one profile resolves its own packages through, nested inside
 * the machine's: a name it does not hold walks up to `<home>/plugins`, which
 * is how a profile root holds no core and still reaches the one the machine
 * has.
 */
export function profileRoot(home: string, profile: string): string {
  return path.join(paths(home).plugins, "profiles", profile);
}

/** Where the forks of a profile whose workflow is installed rather than yours live. */
export function profileForks(home: string, profile: string): string {
  return path.join(home, "profiles", profile, "forks");
}

/** The directories that belong to one profile and to nothing else. */
export function profilePaths(home: string, profile: string | Profile) {
  return { ...paths(home), ...statePaths(home, profile) };
}

function statePaths(home: string, profile: string | Profile) {
  const dirs = directoriesFor(profile);
  const project = phaseState(profile);
  const artifacts = projectArtifacts(profile);

  return {
    records: path.join(home, dirs.records),
    queue: path.join(home, dirs.queue),
    // Plugin-owned state follows the project the way its queue does.
    tasks: path.join(home, project ?? "", "tasks"),
    // One Slack identity per machine, so one thread map: splitting this per
    // profile would forget the threads a running install already answered in.
    slack: path.join(home, project ?? "", "slack"),
    // A project's Telegram topics are its own; the bot's reader is shared.
    telegram: path.join(home, project ?? "", "telegram"),
    ...(artifacts ? { artifacts: path.join(home, artifacts) } : {}),
    ...(project ? { log: path.join(home, project, "log"), pid: profileDaemonPid(home, profile) } : {}),
  };
}

/**
 * A daemon is owned by the configured profile, not its current project path.
 *
 * Project state can deliberately move when a profile is repointed; a live
 * process must stay visible to stop, removal and update checks through that
 * transition so a second worker cannot take its place.
 */
function profileDaemonPid(home: string, profile: string | Profile): string {
  return typeof profile === "string" ? path.join(home, "daemon.pid") : path.join(home, "profiles", profile.name, "daemon.pid");
}

/**
 * Every PID location a profile may own across a packaged/project transition.
 *
 * A project is one profile now, and its phases walk as child records of one
 * record; what moved at the update is the profile's own layout.
 */
export function profileDaemonPids(home: string, profile: string | Profile): readonly string[] {
  if (typeof profile === "string") return [path.join(home, "daemon.pid")];
  const current = profilePaths(home, profile).pid;
  const previous = profile.project ? paths(home).pid : profileDaemonPid(home, profile);
  return current === previous ? [current] : [current, previous];
}

function phaseState(profile: string | Profile): string | undefined {
  return typeof profile === "string" || !profile.project ? undefined : projectStateKey(profile.project, profile.name);
}

function projectArtifacts(profile: string | Profile): string | undefined {
  return typeof profile === "string" ? undefined : artifactDirectory(profile);
}

/**
 * What `amy workflow rm` may delete: the directories no other profile reads.
 *
 * A project owns its tasks, Slack threads and Telegram topics as well as its
 * records and queue; an ordinary profile shares those with its neighbours.
 * Never the log: it is append-only because the budget is measured off it.
 */
export function profileOwnedDirectories(home: string, profile: Profile): string[] {
  const place = profilePaths(home, profile);
  return profile.project ? [place.records, place.queue, place.tasks, place.slack, place.telegram] : [place.records, place.queue];
}
