import fs from "node:fs";
import path from "node:path";
import { profileEnv } from "./paths.js";

/**
 * Parses a .env file.
 *
 * Deliberately small and its own function rather than a dependency, because
 * the only thing it has to hold is an API key and the failure mode of a
 * clever parser is a credential that silently does not load.
 */
export function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equals = withoutExport.indexOf("=");
    if (equals <= 0) continue;

    const key = withoutExport.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = unquote(withoutExport.slice(equals + 1).trim());
  }

  return values;
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));

  return quoted && value.length >= 2 ? value.slice(1, -1) : value;
}

/** What one file says, or nothing when there is no such file. */
function readEnvFile(file: string): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Where a process reads its keys, in the order that wins: the project it was
 * started from first, then the profile it drives, then the machine.
 *
 * The order is the one the docs promise. Exported keys beat all of these
 * because `loadEnvFiles` leaves a key the shell already set alone, so a key
 * exported for one command stays the reliable override.
 */
export function envFiles(
  home: string,
  options: { profile?: string; cwd?: string; project?: string } = {},
): string[] {
  const projectDirectory = options.project?.trim() ? options.project : (options.cwd ?? process.cwd());
  const files = [
    path.join(projectDirectory, ".env"),
    ...(options.profile ? [profileEnv(home, options.profile)] : []),
    path.join(home, ".env"),
  ];

  // The project is often the state directory itself; one file, read once.
  return [...new Set(files.map((file) => path.resolve(file)))];
}

/**
 * Loads the files a process reads, first one wins.
 *
 * Returns the names it set, never the values, so a caller can report what
 * happened without printing a secret — and so a child started for another
 * profile can be told which of its keys came from a file rather than from
 * the shell.
 */
export function loadEnvFiles(files: readonly string[]): string[] {
  const applied: string[] = [];

  for (const file of files) {
    for (const [key, value] of Object.entries(readEnvFile(file))) {
      if (process.env[key] !== undefined) continue;
      process.env[key] = value;
      applied.push(key);
    }
  }

  return applied;
}

/**
 * Loads one .env from a directory into the environment.
 *
 * Kept as the one-file form the docs and the tests name; a machine with
 * profiles reads `envFiles` instead.
 */
export function loadEnv(root: string): string[] {
  return loadEnvFiles([path.join(root, ".env")]);
}

/** The names a profile's own file carries, which are the ones it must not leak. */
function namesOf(file: string): Set<string> {
  return new Set(Object.keys(readEnvFile(file)));
}

/** Every profile's own .env except the one asked for. */
function namesOfOtherProfiles(home: string, profile: string): Set<string> {
  const names = new Set<string>();

  for (const entry of profileDirectories(path.join(home, "profiles"))) {
    if (!entry.isDirectory() || entry.name === profile) continue;
    for (const name of namesOf(profileEnv(home, entry.name))) names.add(name);
  }

  return names;
}

/** A directory's entries, or nothing when it is not there. */
function profileDirectories(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * The environment one profile's process should be given.
 *
 * A child spawned for a profile does not inherit another profile's keys: a
 * name the parent picked up from a file, and another profile's own file also
 * carries, is dropped and re-read from the child's layers. A key the operator
 * exported is not in `fromFiles`, so it survives, which keeps the shell the
 * first word in every process.
 */
export function environmentFor(
  home: string,
  profile: string,
  options: { base?: NodeJS.ProcessEnv; fromFiles?: readonly string[] } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(options.base ?? process.env) };
  const otherProfiles = namesOfOtherProfiles(home, profile);

  for (const name of options.fromFiles ?? []) {
    if (otherProfiles.has(name)) delete env[name];
  }

  for (const file of [profileEnv(home, profile), path.join(home, ".env")]) {
    for (const [key, value] of Object.entries(readEnvFile(file))) {
      if (env[key] === undefined) env[key] = value;
    }
  }

  return env;
}
