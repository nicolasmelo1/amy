import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The five shapes a plugin spec arrives in.
 *
 * `name` and `range` name a package the registry resolves; `git` and
 * `tarball` point at one from outside it; `path` is a directory on this disk.
 * Named once here rather than spelled out in `Resolved` twice, so the
 * document below and the field agree by construction.
 */
type SpecKind = "name" | "range" | "git" | "tarball" | "path";

/**
 * What one spec argument turns into.
 *
 * `install` is the string npm takes. `imported` is what the config names —
 * the string the loader passes to `import()`. Undefined for a git URL and a
 * tarball, whose name is not knowable until the package is on disk, which is
 * the caller's cue to read the installed `package.json` rather than guess.
 * For a path it is the package's own entry, as a `file:` URL, because a
 * directory is not something `import()` accepts — and `absolute` is the
 * directory the spec resolved to, so the config means the same directory from
 * wherever the command was typed.
 */
export interface Resolved {
  kind: SpecKind;
  install: string;
  imported: string | undefined;
  absolute?: string;
}

/**
 * Classifies a plugin spec into what npm installs and what the config names.
 *
 * `amy plugin add` takes one argument and calls it a spec: "anything Node can
 * import". What npm takes and what the config has to name are two different
 * strings for every form but a bare package name, and this is where the two
 * are decided once, together, instead of wherever a command happens to need
 * one of them.
 *
 * A Windows-shaped spec is a path, not a name with a range: a drive letter
 * and a backslash are a directory, so the backslashes are normalized away and
 * the rest is judged like any other path.
 *
 * A path that is not a package is refused here, before anything is run, and
 * the refusal names the missing `package.json`.
 */
export function classify(spec: string, cwd: string): Resolved {
  if (spec.trim().length === 0) {
    throw new Error("a plugin spec is empty; name a package, a URL or a path");
  }

  const candidate = spec.replace(/\\/g, "/");

  const filed = localFileOf(candidate);
  if (filed) return resolvePath(filed, cwd);

  if (isGitSpec(candidate)) return { kind: "git", install: candidate, imported: undefined };
  // What is left of http(s) is a download, whatever the suffix: the shape is
  // the tarball, and npm is the one that finds out what the URL served.
  if (/^https?:\/\//.test(candidate)) {
    return { kind: "tarball", install: candidate, imported: undefined };
  }

  const named = parseName(candidate);
  if (named) return named;

  return resolvePath(candidate, cwd);
}

/**
 * A scope or a package name, with everything after a second `@` as the range.
 *
 * A name is one segment with no slash in it, which is what keeps `./plugin-x`
 * and `packages/plugin-x` out of here: they are paths, and the path half
 * decides them. A bare `.` or `..` is a path too — npm reads both as the
 * caller's directory, and neither is a name any registry carries.
 */
function parseName(spec: string): Resolved | undefined {
  if (spec === "." || spec === "..") return undefined;

  // eslint-disable-next-line security/detect-unsafe-regex -- literal regex, linear
  const scoped = /^@([\w.-]+)\/([\w.-]+)(?:@(.+))?$/s.exec(spec);
  if (scoped) {
    const name = `@${scoped[1]}/${scoped[2]}`;
    return scoped[3] === undefined
      ? { kind: "name", install: spec, imported: name }
      : { kind: "range", install: spec, imported: name };
  }

  // eslint-disable-next-line security/detect-unsafe-regex -- literal regex, linear
  const unscoped = /^([\w.-]+)(?:@(.+))?$/s.exec(spec);
  if (!unscoped) return undefined;

  return unscoped[2] === undefined
    ? { kind: "name", install: spec, imported: unscoped[1] }
    : { kind: "range", install: spec, imported: unscoped[1] };
}

/**
 * Git is what npm cannot answer from the registry: a scheme naming git or
 * ssh, npm's own `github:` shorthand and the ones npm copies it from, the
 * scp-like `host:owner/repo` shape, and an https endpoint that ends in `.git`
 * or carries a ref fragment. Every other http(s) URL is a download.
 */
function isGitSpec(spec: string): boolean {
  return (
    /^(?:git|git\+ssh|git\+https?|git\+file|ssh):\/\//.test(spec) ||
    /^(?:github|gitlab|bitbucket|gist):/.test(spec) ||
    /^[^:/]+@[^:/]+:/.test(spec) ||
    // eslint-disable-next-line security/detect-unsafe-regex -- literal regex, linear
    /^https?:\/\/.+\.git(#.*)?$/.test(spec) ||
    /^https?:\/\/[^#]+#/.test(spec)
  );
}

/**
 * A `file:` spec is npm's own word for a package on this disk, and the
 * documentation this repository carries promises it beside the path form.
 *
 * An absolute `file:` URL is decoded by Node itself — `fileURLToPath` is what
 * turns `file:///C:/...` into `C:\...` on Windows and reads UNC hosts and
 * percent escapes the way an import would. A bare `file:` prefix is npm's
 * relative shorthand: what follows is exactly what a caller could have typed
 * as a path, and the path half decides it.
 */
function localFileOf(candidate: string): string | undefined {
  const absolute = /^file:\/\/(.+)$/.exec(candidate);
  if (absolute?.[1]) {
    try {
      return fileURLToPath(new URL(candidate));
    } catch (error) {
      throw new Error(`${candidate} is not a file URL a package can live at`, { cause: error });
    }
  }

  const bare = /^file:(?!\/\/)(.+)$/.exec(candidate);
  return bare?.[1];
}

/** A path the package manager can find a package in, or the refusal. */
function resolvePath(candidate: string, cwd: string): Resolved {
  const absolute = isHomeRelative(candidate)
    ? path.join(os.homedir(), candidate.slice(2))
    : path.resolve(cwd, candidate);

  if (!isPackageDirectory(absolute)) {
    throw new Error(`${candidate} is not a package: its package.json is missing at ${absolute}`);
  }

  return { kind: "path", install: absolute, imported: entrySpecifier(absolute), absolute };
}

/**
 * Only a bare `~` or a path under it names the home directory.
 *
 * `~owner/plugin` is npm's user shorthand and this program has no user
 * database to ask, so it stays relative to the caller's directory, where a
 * directory literally named `~owner` would be.
 */
function isHomeRelative(candidate: string): boolean {
  return candidate === "~" || candidate.startsWith("~/");
}

/** A directory carrying a readable `package.json` file, not a directory named so. */
function isPackageDirectory(directory: string): boolean {
  try {
    return fs.statSync(path.join(directory, "package.json")).isFile();
  } catch {
    return false;
  }
}

/**
 * The file the loader can import, read off the package's own entry.
 *
 * The entry follows Node's exports algorithm for the package root:
 * an `exports` field present is authoritative — a string, or its `.`
 * member walked in declaration order through nested conditions, and an
 * `exports` that names no root is a refusal, because Node itself cannot
 * import the package root then. Without `exports`, `main` decides, and
 * the `index.js` both npm and Node fall back to is last. A
 * `package.json` that cannot be read or parsed is refused with the
 * error carried as its cause rather than resolved past.
 */
function entrySpecifier(directory: string): string {
  const manifestPath = path.join(directory, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (error) {
    throw new Error(`${directory} carries a package.json that cannot be read`, { cause: error });
  }

  const exported = (manifest as { exports?: unknown }).exports;
  const entry =
    exported === undefined
      ? (entryFromMain((manifest as { main?: unknown }).main) ?? "./index.js")
      : entryFromExports(exported);

  if (entry === undefined) {
    throw new Error(
      `${directory} carries an exports map that names no root, so nothing can import the package`,
    );
  }
  return pathToFileURL(path.join(directory, packageTarget(directory, entry))).href;
}

/**
 * A target `exports` may name, held to Node's own constraints.
 *
 * A target must be a relative specifier into the package: it starts with
 * `./`, carries no `..` segment and no absolute body. Node refuses anything
 * else, and so does this half — a target like `./../../outside.js` would
 * otherwise have the loader import a file that is not in the package at all,
 * and a bare `dist/index.js` is invalid to Node outright.
 */
function packageTarget(directory: string, entry: string): string {
  if (!entry.startsWith("./")) {
    throw new Error(`${directory} carries an exports target Node cannot take: ${entry}`);
  }
  const inside = path.resolve(directory, entry);
  if (path.relative(directory, inside).startsWith("..")) {
    throw new Error(`${directory} carries an exports target outside the package: ${entry}`);
  }
  return entry;
}

/** The entry the `exports` field names, by Node's exports algorithm. */
function entryFromExports(exports: unknown): string | undefined {
  // A bare string is the whole map for the root: Node reads
  // `exports: "./x.js"` exactly as `exports: { ".": "./x.js" }`.
  if (typeof exports === "string" && exports.length > 0) return exports;

  const map = exports as Record<string, unknown> | undefined;
  const dot = map?.["."];
  // A top-level member named `import`, `node` or `default` is the root
  // condition map itself — Node reads `{"import": "./x.js"}` as the root
  // entry, and only a key starting with `.` names a subpath.
  if (dot === undefined && Object.keys(map ?? {}).some((key) => !key.startsWith("."))) {
    return entryFromRoot(map);
  }
  return entryFromRoot(dot);
}

/**
 * The entry one member of `exports` names, following Node's own walk.
 *
 * A string is the target. An object is conditions in declaration order:
 * the first arm named `import`, `node` or `default` wins, recursing into a
 * nested condition object the way Node does — so `{"node": {"import":
 * "./node.js"}, "default": "./b.js"}` answers `./node.js`, and
 * `{"node": "./a.js", "default": "./b.js"}` answers `./a.js` rather than
 * the fallback that happens to be read later.
 */
function entryFromRoot(member: unknown): string | undefined {
  if (typeof member === "string" && member.length > 0) return member;
  if (!member || typeof member !== "object") return undefined;
  for (const [condition, value] of Object.entries(member as Record<string, unknown>)) {
    if (!["import", "node", "default"].includes(condition)) continue;
    const resolved = entryFromRoot(value);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/** The `main` member, when the package carries one. */
function entryFromMain(main: unknown): string | undefined {
  return typeof main === "string" && main.length > 0 ? main : undefined;
}