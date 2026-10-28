// Turns a fixture package written in TypeScript into what npm would ship:
// every `.ts` beside its `.js`, types stripped, the `.ts` gone. Node refuses
// to strip types under `node_modules`, so a package a scenario installs has
// to arrive compiled, the same as every real one.
//
// Usage: tsx publish.ts <fixture-dir> <out-dir>
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [fixture, out] = process.argv.slice(2);
if (fixture === undefined || out === undefined) {
  console.error("usage: publish.ts <fixture-dir> <out-dir>");
  process.exit(2);
}

fs.cpSync(fixture, out, { recursive: true });
for (const entry of fs.readdirSync(out, { recursive: true, encoding: "utf-8" })) {
  if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
  const source = path.join(out, entry);
  const { outputText } = ts.transpileModule(fs.readFileSync(source, "utf-8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
    fileName: source,
  });
  fs.writeFileSync(source.replace(/\.ts$/, ".js"), outputText, "utf-8");
  fs.rmSync(source);
}
