// How many workflows a config declares, read with the `yaml` the install at
// <lib-dir> carries rather than this checkout's.
//
// Usage: tsx declared.ts <lib-dir> <config.yaml>
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [lib, file] = process.argv.slice(2);
if (lib === undefined || file === undefined) {
  console.error("usage: declared.ts <lib-dir> <config.yaml>");
  process.exit(2);
}
const yaml: typeof import("yaml") = createRequire(path.join(path.resolve(lib), "package.json"))("yaml");
const p: { workflows?: Record<string, unknown> } = yaml.parse(fs.readFileSync(file, "utf-8")) ?? {};
process.stdout.write(String(Object.keys(p.workflows ?? {}).length));
