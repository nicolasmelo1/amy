import fs from "node:fs";
import path from "node:path";
import type { CommandResult, CommandRunner } from "@amykit/core";

/** The nth argument the scenario passed, or a usage line and an exit. */
function argument(n: number): string {
  const value = process.argv[2 + n];
  if (value !== undefined) return value;
  console.error("usage: probe.ts <repo> <dist> <report>");
  process.exit(2);
}

interface RawAncestry {
  state: string;
  merged: boolean;
  headRefName: string;
  baseRefName: string;
}

const [repo, dist, report] = [argument(0), argument(1), argument(2)];
const { GitHubCodeHost }: typeof import("@amykit/plugin-github") = await import(dist);
const assertions: { type: string; status: "passed" | "failed" }[] = [];
const record = (type: string, ok: boolean): number => assertions.push({ type, status: ok ? "passed" : "failed" });
const calls: (readonly string[])[] = [];
const answer = (stdout: string): CommandResult => ({ ok: true, exitCode: 0, stdout, stderr: "" });
let parent: RawAncestry | null = { state: "OPEN", merged: false, headRefName: "ada/parent", baseRefName: "main" };
const runner: CommandRunner = {
  async run(_command, args) {
    calls.push(args);
    const query = args.find((arg) => arg.startsWith("query=")) ?? "";
    if (query.includes("PullRequestAncestry")) {
      return answer(JSON.stringify({ data: { repository: { pullRequest: parent } } }));
    }
    if (args.includes("POST") && args.some((arg) => arg.endsWith("/pulls"))) {
      return answer(JSON.stringify({ number: 91 }));
    }
    return answer("main");
  },
};
const host = new GitHubCodeHost(runner);
await host.openPullRequest({ repo: "acme/widgets", branch: "ada/child", title: "child", base: "ada/parent", body: "" });
record("stack.a_pull_request_opens_on_the_parent_head_while_it_is_open", calls.at(-1)?.includes("base=ada/parent") === true);
record("stack.a_pull_request_opens_on_the_parent_head_while_it_is_open", (await host.pullRequestAncestry("acme/widgets", 90))?.state === "open");
parent = { state: "CLOSED", merged: true, headRefName: "ada/parent", baseRefName: "main" };
record("stack.a_merged_parent_answers_its_recorded_base", JSON.stringify(await host.pullRequestAncestry("acme/widgets", 90)) === JSON.stringify({ state: "merged", headBranch: "ada/parent", baseBranch: "main" }));
parent = { state: "CLOSED", merged: false, headRefName: "ada/parent", baseRefName: "main" };
record("stack.an_absent_parent_or_one_closed_unmerged_waits", (await host.pullRequestAncestry("acme/widgets", 90))?.state === "closed-unmerged");
parent = null;
record("stack.an_absent_parent_or_one_closed_unmerged_waits", (await host.pullRequestAncestry("acme/widgets", 90))?.state === "absent");
const workflowSources = fs.readdirSync(path.join(repo, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("workflow-"))
  .flatMap((entry) => fs.readdirSync(path.join(repo, "packages", entry.name, "src"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join(repo, "packages", entry.name, "src", file)))
  .map((file) => fs.readFileSync(file, "utf8"));
record("stack.no_workflow_learns_the_word_github", workflowSources.every((source) => !source.toLowerCase().includes("github")));
const failed = assertions.filter((assertion) => assertion.status !== "passed");
fs.writeFileSync(report, `${JSON.stringify({ scenario: "plugin-github", status: failed.length === 0 ? "passed" : "failed", goal: "Prove the built GitHub adapter gives stacked work an explicit parent base without teaching a workflow its forge.", artifact: { package: "@amykit/plugin-github", entry: "dist/index.js" }, observed: { assertions_run: assertions.length, assertions_failed: failed.length, node: process.version }, assertions }, null, 2)}\n`);
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length) process.exit(1);
