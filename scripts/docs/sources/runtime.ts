import { readJson } from "../lib/repo.js";
import type { RuntimeFacts } from "../lib/facts.js";

interface PackageManifest {
  engines?: { node?: string };
}

/** The minimum Node release npm enforces for the published command. */
export function runtimeFacts(): RuntimeFacts {
  const manifest = readJson<PackageManifest>("packages/cli/package.json");
  const node = manifest.engines?.node;
  if (!node) throw new Error("packages/cli/package.json must declare engines.node");
  return { node };
}
