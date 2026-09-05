#!/usr/bin/env node
import { CACHE, refreshReleases } from "./sources/releases.mjs";

/**
 * Refreshes the cached view of what GitHub has released.
 *
 * Its own command rather than part of generating, because the two answer to
 * different masters. This one needs a network and a credential and changes
 * when somebody publishes; generating has to be reproducible on any machine at
 * any time. Keeping them apart is what lets the drift check be a check.
 */
try {
  const releases = refreshReleases();
  console.log(`${releases.length} release(s) written to ${CACHE.replace(`${process.cwd()}/`, "")}`);
  console.log("run `npm run docs:generate` to render the news page");
} catch (error) {
  console.error("could not ask GitHub for the releases:");
  console.error(`  ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  console.error("");
  console.error("  `gh` has to be installed and authenticated. The cached file is left as it was,");
  console.error("  so generating the documentation still works.");
  process.exit(1);
}
