/**
 * Which build is running.
 *
 * Nothing here reads the environment or the file system. What a build is gets
 * decided by whoever can tell — the CLI, from the stamp `npm pack` wrote into
 * the package — and this is only the shape of the answer and how it is said.
 */
export interface BuildStamp {
  /** The version this was built at, or `dev`. */
  version: string;
  /** The commit it was built from, short, or `dev`. */
  commit: string;
  /** When it was built, ISO 8601, or empty when it was not built. */
  builtAt: string;
  /** True when this is an installed release rather than a checkout. */
  released: boolean;
}

/** What goes on a log line: short, and different for every build. */
export function stampId(stamp: BuildStamp): string {
  return stamp.released ? `${stamp.version}+${stamp.commit}` : "dev";
}

export function stampFrom(
  defined: Partial<Record<"version" | "commit" | "builtAt", string>>,
): BuildStamp {
  const version = defined.version ?? "";
  const commit = defined.commit ?? "";

  // Both, or neither. A half-stamped install would claim to be a release
  // while being unable to say which one, and that is worse than admitting it
  // is a checkout.
  if (!version || !commit) {
    return { version: "dev", commit: "dev", builtAt: "", released: false };
  }

  return { version, commit, builtAt: defined.builtAt ?? "", released: true };
}

/** One line for `amy --version`, which is a different audience to the log. */
export function describeBuild(stamp: BuildStamp): string {
  if (!stamp.released) {
    return "dev (running from source, not an installed build)";
  }

  const when = stamp.builtAt ? `, built ${stamp.builtAt}` : "";
  return `${stamp.version} (${stamp.commit}${when})`;
}
