import fs from "node:fs";
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

/** The two directories that belong to one profile and to nothing else. */
export function profilePaths(home: string, profile: string | Profile) {
  return { ...paths(home), ...statePaths(home, profile) };
}

function statePaths(home: string, profile: string | Profile) {
  const dirs = directoriesFor(profile);
  const name = typeof profile === "string" ? profile : profile.name;
  const project = phaseState(profile);
  const legacy = keepsLegacyState(home, name, project);

  return {
    records: path.join(home, legacy ? name : dirs.records, legacy ? "records" : ""),
    queue: path.join(home, legacy ? name : dirs.queue, legacy ? "queue" : ""),
    ...(project ? {
      artifacts: path.join(home, projectArtifacts(profile)!),
      log: path.join(home, project, "log"),
      // A retained legacy queue is still driven by the legacy daemon. Keep
      // looking at its PID until an explicit state migration moves the queue.
      pid: path.join(home, legacy ? "daemon.pid" : project, legacy ? "" : "daemon.pid"),
    } : {}),
  };
}

function phaseState(profile: string | Profile): string | undefined {
  return typeof profile === "string" || !profile.project ? undefined : projectStateKey(profile.project, profile.name);
}

function projectArtifacts(profile: string | Profile): string | undefined {
  return typeof profile === "string" ? undefined : artifactDirectory(profile);
}

function keepsLegacyState(home: string, name: string, project: string | undefined): boolean {
  // Adding a sibling must not make an existing workflow's records disappear.
  // Retain the old profile directory until an explicit migration moves it.
  // Creating a phase PID or log directory is not a state migration.
  return project !== undefined && (
    fs.existsSync(path.join(home, name, "records")) || fs.existsSync(path.join(home, name, "queue"))
  );
}
