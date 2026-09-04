/**
 * Which build is running.
 *
 * These read as normal environment lookups and are not. `bun build --define`
 * replaces the exact expression `process.env.AMY_BUILD_COMMIT` with a literal
 * at compile time, so a compiled binary carries its own identity with nothing
 * to read from disk. Running from source leaves them undefined, which is how
 * a dev run is told apart from a build.
 *
 * Written as the full expression on purpose: the substitution is textual, so
 * `env.AMY_BUILD_COMMIT` through a variable would silently never be replaced.
 */
const DEFINED = {
  version: process.env.AMY_BUILD_VERSION,
  commit: process.env.AMY_BUILD_COMMIT,
  builtAt: process.env.AMY_BUILD_AT,
};

export interface BuildStamp {
  /** The version this was built at, or `dev`. */
  version: string;
  /** The commit it was built from, short, or `dev`. */
  commit: string;
  /** When it was built, ISO 8601, or empty when it was not built. */
  builtAt: string;
  /** True when this is a compiled binary rather than a checkout. */
  released: boolean;
}

/** What goes on a log line: short, and different for every build. */
export function stampId(stamp: BuildStamp): string {
  return stamp.released ? `${stamp.version}+${stamp.commit}` : "dev";
}

export function stampFrom(defined: Partial<Record<keyof typeof DEFINED, string>>): BuildStamp {
  const version = defined.version ?? "";
  const commit = defined.commit ?? "";

  // Both, or neither. A half-stamped binary would claim to be a release while
  // being unable to say which one, and that is worse than admitting it is a
  // checkout.
  if (!version || !commit) {
    return { version: "dev", commit: "dev", builtAt: "", released: false };
  }

  return { version, commit, builtAt: defined.builtAt ?? "", released: true };
}

export function buildStamp(): BuildStamp {
  return stampFrom(DEFINED);
}

/** One line for `amy --version`, which is a different audience to the log. */
export function describeBuild(stamp: BuildStamp): string {
  if (!stamp.released) {
    return "dev (running from source, not an installed build)";
  }

  const when = stamp.builtAt ? `, built ${stamp.builtAt}` : "";
  return `${stamp.version} (${stamp.commit}${when})`;
}
