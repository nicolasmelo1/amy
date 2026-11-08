// L3.EVERY_DECLARED_ERROR_IS_TESTED: every (operation, error code) the document
// declares is an outcome some test of the services produced through invoke.
// A declared error nobody has seen is a promise nobody checked
// (docs/design/amy-speaks-in-domains.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { report, repository, root, services } from "./read.js";

type Json = Record<string, unknown>;
const findings: string[] = [];
const declared = declaredErrors();

if (declared.length > 0) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-outcomes-"));
  const record = path.join(scratch, "outcomes.jsonl");
  fs.writeFileSync(record, "");
  const vitest = path.join(repository, "node_modules/.bin/vitest");
  const run = spawnSync(vitest, ["run", "--config", path.join(repository, "packages/services/gates/outcomes.config.ts")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, AMY_OUTCOMES: record },
  });
  if (run.status !== 0) findings.push(`the services' tests failed, so no outcome they record can be trusted:\n${run.stdout}${run.stderr}`);
  const seen = new Set(
    fs
      .readFileSync(record, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { operation: string; kind: string; code?: string })
      .filter((one) => one.kind === "error")
      .map((one) => `${one.operation} ${one.code}`),
  );
  for (const [operation, code] of declared) {
    if (!seen.has(`${operation} ${code}`)) findings.push(`\`${operation}\` declares \`${code}\`, and no test produced it through invoke`);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

function declaredErrors(): [string, string][] {
  const file = path.join(services, "openapi.json");
  if (!fs.existsSync(file)) return [];
  const document = JSON.parse(fs.readFileSync(file, "utf8")) as { paths?: Record<string, Record<string, Json>> };
  const found: [string, string][] = [];
  for (const methods of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      const failure = (((operation.responses as Json | undefined)?.default as Json | undefined)?.content as Record<string, Json> | undefined)?.["application/json"]?.schema as Json | undefined;
      for (const code of Object.keys((failure?.["x-amy-errors"] ?? {}) as Json)) found.push([String(operation.operationId), code]);
    }
  }
  return found;
}

report("L3.EVERY_DECLARED_ERROR_IS_TESTED", findings);
