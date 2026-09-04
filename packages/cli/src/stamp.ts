import fs from "node:fs";
import { BuildStamp, buildStamp, stampFrom } from "@amy/core";

/**
 * Where `npm pack` leaves this build's identity, beside the code it built.
 *
 * A compiled binary carries its identity in `--define` literals, which
 * `buildStamp()` reads. A package installed from a registry cannot: there is
 * no compile step to substitute anything. So the identity is written into the
 * tarball at pack time, and **its absence is what a checkout looks like** —
 * which is the whole point. Reading the version out of `package.json` instead
 * would make a working tree claim to be a release, and the stamp exists to
 * tell those two apart.
 */
const STAMP_FILE = "stamp.json";

interface WrittenStamp {
  version?: string;
  commit?: string;
  builtAt?: string;
}

/**
 * What this install is: a release, or a checkout.
 *
 * The directory is a parameter so a test can point it somewhere real. In
 * production it is the directory this module was loaded from, which is
 * `dist/` in an installed package and `src/` in a checkout — and only the
 * first of those ever has a stamp in it.
 */
export function installedStamp(from: URL = new URL("./", import.meta.url)): BuildStamp {
  // A binary wins: it was told what it is at compile time, and that is more
  // reliable than a file that could have been left behind by anything.
  const compiled = buildStamp();
  if (compiled.released) return compiled;

  const written = read(new URL(STAMP_FILE, from));
  return stampFrom({
    version: written?.version,
    commit: written?.commit,
    builtAt: written?.builtAt,
  });
}

/**
 * Returns nothing rather than throwing.
 *
 * A stamp that will not parse is a build that cannot say what it is, and
 * `stampFrom` already has a name for that: `dev`. Failing to start over it
 * would be refusing to run over a cosmetic detail.
 */
function read(file: URL): WrittenStamp | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as WrittenStamp;
  } catch {
    return undefined;
  }
}
