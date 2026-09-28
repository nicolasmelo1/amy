#!/bin/sh
# Repeatable evidence for the GitHub adapter's stack-parent contract.
set -eu

report=${1:-.software-factory/evidence/plugin-github-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
dist="$repo/plugins/github/dist/index.js"
test -f "$dist" || { echo "build it first: npm run build" >&2; exit 1; }

node --input-type=module - "$repo" "$dist" "$report" <<'PROBE'
import fs from "node:fs";
import path from "node:path";

const [repo, dist, report] = process.argv.slice(2);
const { GitHubCodeHost } = await import(dist);
const assertions = [];
const record = (type, ok) => assertions.push({ type, status: ok ? "passed" : "failed" });
const calls = [];
let parent = { state: "OPEN", headRefName: "ada/parent", baseRefName: "main" };
const runner = {
  async run(_command, args) {
    calls.push(args);
    const query = args.find((arg) => arg.startsWith("query=")) ?? "";
    if (query.includes("PullRequestAncestry")) {
      return { ok: true, stdout: JSON.stringify({ data: { repository: { pullRequest: parent } } }), stderr: "" };
    }
    if (args.includes("POST") && args.some((arg) => arg.endsWith("/pulls"))) {
      return { ok: true, stdout: JSON.stringify({ number: 91 }), stderr: "" };
    }
    return { ok: true, stdout: "main", stderr: "" };
  },
};
const host = new GitHubCodeHost(runner);
await host.openPullRequest({ repo: "acme/widgets", branch: "ada/child", title: "child", base: "ada/parent", body: "" });
record("stack.a_pull_request_opens_on_the_parent_head_while_it_is_open", calls.at(-1)?.includes("base=ada/parent") === true);
record("stack.a_merged_parent_answers_its_recorded_base", (await host.pullRequestAncestry("acme/widgets", 90)).state === "open");
parent = { state: "MERGED", headRefName: "ada/parent", baseRefName: "main" };
record("stack.a_merged_parent_answers_its_recorded_base", JSON.stringify(await host.pullRequestAncestry("acme/widgets", 90)) === JSON.stringify({ state: "merged", headBranch: "ada/parent", baseBranch: "main" }));
parent = { state: "CLOSED", headRefName: "ada/parent", baseRefName: "main" };
record("stack.an_absent_parent_or_one_closed_unmerged_waits", (await host.pullRequestAncestry("acme/widgets", 90)).state === "closed-unmerged");
parent = null;
record("stack.an_absent_parent_or_one_closed_unmerged_waits", (await host.pullRequestAncestry("acme/widgets", 90)).state === "absent");
const workflowSources = fs.readdirSync(path.join(repo, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("workflow-"))
  .flatMap((entry) => fs.readdirSync(path.join(repo, "packages", entry.name, "src"), { recursive: true })
    .filter((file) => typeof file === "string" && file.endsWith(".ts"))
    .map((file) => path.join(repo, "packages", entry.name, "src", file)))
  .map((file) => fs.readFileSync(file, "utf8"));
record("stack.no_workflow_learns_the_word_github", workflowSources.every((source) => !source.includes("GitHub")));
const failed = assertions.filter((assertion) => assertion.status !== "passed");
fs.writeFileSync(report, `${JSON.stringify({ scenario: "plugin-github", status: failed.length === 0 ? "passed" : "failed", goal: "Prove the built GitHub adapter gives stacked work an explicit parent base without teaching a workflow its forge.", artifact: { package: "@amykit/plugin-github", entry: "dist/index.js" }, observed: { assertions_run: assertions.length, assertions_failed: failed.length, node: process.version }, assertions }, null, 2)}\n`);
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length) process.exit(1);
PROBE
