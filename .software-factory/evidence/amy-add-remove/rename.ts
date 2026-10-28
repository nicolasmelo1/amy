// Turns a published copy of the on-call package into `@acme/workflow-afterhours`.
//
// Usage: tsx rename.ts <package-dir>
import fs from "node:fs";

const root = process.argv[2];
if (root === undefined) {
  console.error("usage: rename.ts <package-dir>");
  process.exit(2);
}
const manifest: { name: string } = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));
manifest.name = "@acme/workflow-afterhours";
fs.writeFileSync(`${root}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const entry = fs.readFileSync(`${root}/index.js`, "utf8").replaceAll("oncall", "afterhours");
fs.writeFileSync(`${root}/index.js`, entry);
