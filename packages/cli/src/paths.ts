import path from "node:path";
import { Profile, artifactDirectory, directoriesFor, projectStateKey } from "./profiles.js";

/**
 * What every profile shares, under one state directory.
 *
 * The config, the roster, the log, the handbrake, the notes and the inbox are
 * shared on purpose. One log means one budget, and one handbrake means
 * `amy pause` stops the machine rather than the workflow you happened to name.
 */
export function paths(home: string) {
  return {
    base: home,
    config: path.join(home, "config.yaml"),
    roster: path.join(home, "roster.yaml"),
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
    // Plugin-owned state follows the phase the way its queue does.
    tasks: path.join(home, project ?? "", "tasks"),
    slack: path.join(home, project ?? "", "slack"),
    ...(artifacts ? { artifacts: path.join(home, artifacts) } : {}),
    ...(project ? { log: path.join(home, project, "log"), pid: path.join(home, project, "daemon.pid") } : {}),
  };
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
 * A phase owns its tasks and Slack threads as well as its records and queue;
 * an ordinary profile shares those with its neighbours. Never the log: it is
 * append-only because the budget is measured off it.
 */
export function profileOwnedDirectories(home: string, profile: Profile): string[] {
  const place = profilePaths(home, profile);
  return profile.project ? [place.records, place.queue, place.tasks, place.slack] : [place.records, place.queue];
}
