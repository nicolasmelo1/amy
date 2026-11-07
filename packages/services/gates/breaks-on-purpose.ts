// L2.THE_CONTRACT_ONLY_BREAKS_ON_PURPOSE: a change to packages/services/openapi.json
// that oasdiff reports as breaking at ERR is refused unless the same change
// raises the contract's major (docs/design/amy-speaks-in-domains.md).
//
// The base is the document at the merge-base with the default branch, or the
// file `--base` names, which is how a mutation fixture brings its own.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { report, repository, root, services } from "./read.js";

const DOCUMENT = "packages/services/openapi.json";
const findings: string[] = [];
const head = path.join(services, "openapi.json");
const base = baseDocument();

if (base !== undefined && fs.existsSync(head)) {
  const raised = majorOf(fs.readFileSync(head, "utf8")) > majorOf(base);
  if (!raised) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-contract-"));
    const before = path.join(scratch, "base.json");
    fs.writeFileSync(before, base);
    const run = spawnSync("oasdiff", ["breaking", before, head, "--fail-on", "ERR", "--format", "singleline"], { encoding: "utf8" });
    if (run.error) {
      findings.push(`oasdiff did not run (${run.error.message}): it is pinned in .software-factory/toolchain.lock.json and ./scripts/setup-dev.sh installs it`);
    } else if (run.status !== 0) {
      const said = `${run.stdout}${run.stderr}`.trim().split("\n").filter(Boolean);
      findings.push(`${DOCUMENT} breaks its contract without raising API_MAJOR in packages/services/src/contract.ts:`, ...said.map((one) => `  ${one}`));
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function baseDocument(): string | undefined {
  const named = process.argv.indexOf("--base");
  if (named !== -1) {
    const file = path.resolve(root, process.argv[named + 1] ?? "");
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  }
  const ref = ["origin/main", "main"].find((candidate) => git(["rev-parse", "--verify", "--quiet", candidate]) !== undefined);
  const mergeBase = ref === undefined ? undefined : git(["merge-base", "HEAD", ref]);
  return mergeBase === undefined ? undefined : git(["show", `${mergeBase}:${DOCUMENT}`]);
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

function majorOf(text: string): number {
  const version = (JSON.parse(text) as { info?: { version?: string } }).info?.version ?? "0";
  return Number(version.split(".")[0]) || 0;
}

report("L2.THE_CONTRACT_ONLY_BREAKS_ON_PURPOSE", findings);
