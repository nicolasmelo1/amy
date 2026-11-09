// Writes registry/<package>.json for every published package: its source at
// its version, as a shadcn registry item (S16 of the plan a fork comes from).
// `--check` writes nothing and fails naming every item that is stale.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { itemFile, publicPackages, registryItem, serialize, staleItems } from "../packages/cli/src/registry-item.js";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "packages", "plugins", "examples"], { cwd: root, encoding: "utf-8" })
  .split("\0")
  .filter((file) => file && fs.existsSync(path.join(root, file)));

if (process.argv.includes("--check")) {
  const stale = staleItems(root, tracked);
  if (stale.length > 0) {
    console.error("registry items that no longer match their package — run `npm run registry:generate`:\n");
    for (const item of stale) console.error(`  ${item}`);
    process.exit(1);
  }
  console.log("registry items: every published package's source, at its version");
} else {
  const registry = path.join(root, "registry");
  fs.rmSync(registry, { recursive: true, force: true });
  fs.mkdirSync(registry, { recursive: true });
  for (const directory of publicPackages(root)) {
    const item = registryItem(root, directory, tracked);
    fs.writeFileSync(itemFile(root, item), serialize(item), "utf-8");
  }
  console.log(`wrote ${publicPackages(root).length} registry items into registry/`);
}
