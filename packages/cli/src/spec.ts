import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
 * undefined for a git URL and a tarball, whose name is not knowable until the
 * package is on disk, which is the caller's cue to read the installed
 * `package.json` rather than guess. `absolute` is set for a path: the
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

  if (isGitSpec(candidate)) return { kind: "git", install: candidate, imported: undefined };
  if (isTarballSpec(candidate)) return { kind: "tarball", install: candidate, imported: undefined };
  const named = parseName(candidate);
  if (named) return named;

  return resolvePath(candidate, cwd);
}

/** An https endpoint that downloads a package rather than cloning it. */
function isTarballSpec(spec: string): boolean {
  // A literal, linear pattern: the plugin cannot see that, and the parser is
  // the one place a spec-shaped string is read as one.
  // eslint-disable-next-line security/detect-unsafe-regex -- literal regex, linear
  return /^https?:\/\/[^#]+\.tgz(#.*)?$/.test(spec);
}

/**
 * A scope or a package name, with everything after a second `@` as the range.
 *
 * A name is one segment with no slash in it, which is what keeps `./plugin-x`
 * and `packages/plugin-x` out of here: they are paths, and the path half
 * decides them.
 */
function parseName(spec: string): Resolved | undefined {
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
 * ssh, npm's own `github:` shorthand, the scp-like `host:owner/repo` shape,
 * and an https endpoint that ends in `.git` or carries a ref fragment. What
 * is left of https is a tarball.
 */
function isGitSpec(spec: string): boolean {
  return (
    /^(?:git|git\+ssh|git\+https?|git\+file|ssh):\/\//.test(spec) ||
    /^github:/.test(spec) ||
    /^[^:/]+@[^:/]+:/.test(spec) ||
    // eslint-disable-next-line security/detect-unsafe-regex -- literal regex, linear
    /^https?:\/\/.+\.git(#.*)?$/.test(spec) ||
    /^https?:\/\/[^#]+#/.test(spec)
  );
}

/** A path the package manager can find a package in, or the refusal. */
function resolvePath(candidate: string, cwd: string): Resolved {
  const absolute = candidate.startsWith("~")
    ? path.join(os.homedir(), candidate.slice(2))
    : path.resolve(cwd, candidate);

  if (!isPackageDirectory(absolute)) {
    throw new Error(`${candidate} is not a package: its package.json is missing at ${absolute}`);
  }

  return { kind: "path", install: absolute, imported: absolute, absolute };
}

/** A directory carrying a readable `package.json` file, not a directory named so. */
function isPackageDirectory(directory: string): boolean {
  try {
    return fs.statSync(path.join(directory, "package.json")).isFile();
  } catch {
    return false;
  }
}