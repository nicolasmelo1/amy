// A plan in docs/design/ is delivered, so it may promise nothing it did not
// prove. Run from the root of the tree it judges: the repository, or a
// mutation fixture shaped like one.
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { deliveredPromises } from "./plans/delivered.js";

const root = process.cwd();
const designDir = path.join(root, "docs/design");
const policy: { gates?: Record<string, { required_assertions?: string[] }> } =
  yaml.parse(fs.readFileSync(path.join(root, ".software-factory/policy.yaml"), "utf8")) ?? {};

const notes = Object.fromEntries(
  (fs.existsSync(designDir) ? fs.readdirSync(designDir) : [])
    .filter((name) => name.endsWith(".md"))
    .map((name) => [`docs/design/${name}`, fs.readFileSync(path.join(designDir, name), "utf8")]),
);
const requiredAssertions = new Set(Object.values(policy.gates ?? {}).flatMap((gate) => gate.required_assertions ?? []));
const problems = deliveredPromises({ notes, requiredAssertions, exists: (file) => fs.existsSync(path.join(root, file)) });

if (problems.length > 0) {
  console.error("A delivered plan still promises what it did not prove:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`delivered plans: ${Object.keys(notes).length} notes, every criterion ticked and proven`);
