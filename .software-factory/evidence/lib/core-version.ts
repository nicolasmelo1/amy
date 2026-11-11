// The core this repository holds, read, never written: a fixture that depends
// on it says `"current"` and follows every release. A range written by hand
// went stale at 0.7.0 and `amy workflow add` refused every fixture it met.
//
// Usage: tsx core-version.ts   (prints the version, for a shell stub)
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const CORE_VERSION = (JSON.parse(fs.readFileSync(new URL("../../../packages/core/package.json", import.meta.url), "utf8")) as { version: string }).version;

/** The range a fixture package asks for the core with. */
export const CORE_RANGE = `^${CORE_VERSION}`;

/** What a fixture writes instead of a version for an `@amykit` dependency. */
export const CURRENT = "current";

/**
 * A fixture manifest's `@amykit` ranges, resolved: `current` becomes the
 * core's range, and a number written by hand is refused, naming the file.
 */
export function resolveAmykitRanges(manifest: string): void {
  const json = JSON.parse(fs.readFileSync(manifest, "utf8")) as Record<string, unknown>;
  for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
    const deps = json[field] as Record<string, string> | undefined;
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (!name.startsWith("@amykit/")) continue;
      if (range !== CURRENT) throw new Error(`${manifest}: ${name} is ${JSON.stringify(range)}; a fixture says "${CURRENT}", which follows the core this repository holds`);
      deps![name] = CORE_RANGE;
    }
  }
  fs.writeFileSync(manifest, `${JSON.stringify(json, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(CORE_VERSION);
