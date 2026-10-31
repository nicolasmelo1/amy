// The stand-in agent, doing an errand in the checkout it was handed.
//
// It edits real files in the real worktree, so the commit that follows, the
// push and the pull request are all doing their actual work. It reads the
// prompt it was given rather than a script of decisions: what an errand turns
// into is the sentence somebody said, and a stand-in that had the answer
// precomputed would prove the harness rather than the workflow.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const world = process.env.AMY_E2E_WORLD;
if (!world) {
  process.stderr.write("AMY_E2E_WORLD names no world for this stand-in\n");
  process.exit(1);
}
const scriptFile = path.join(world, "agent.json");

if (process.argv.includes("--version")) {
  process.stdout.write("2.0.0 (stand-in)\n");
  process.exit(0);
}

const model = process.argv[process.argv.indexOf("--model") + 1] ?? "";
const prompt = fs.readFileSync(0, "utf-8");

/** Which sentence of the four this was, read off the prompt rather than told. */
function kindOf(said: string): string {
  if (said.includes("rewrite the billing ledger from scratch")) return "refusal";
  if (said.includes("check whether the nightly sync still runs against the old bucket")) return "question";
  if (said.includes("add a changelog entry for the api package")) return "committed";
  if (said.includes("bump the stale dependencies in the api package")) return "change";
  return "unknown";
}

const task = kindOf(prompt);
const script = JSON.parse(fs.readFileSync(scriptFile, "utf-8")) as { asked: Record<string, number> };
script.asked[task] = (script.asked[task] ?? 0) + 1;
fs.writeFileSync(scriptFile, `${JSON.stringify(script, null, 2)}\n`, "utf-8");

fs.appendFileSync(
  path.join(world, "claude.log"),
  `${JSON.stringify({
    at: new Date().toISOString(),
    model,
    task,
    asked: script.asked[task],
    cwd: process.cwd(),
    prompt,
  })}\n`,
);

/** The envelope `claude -p --output-format json` prints, with this run's answer. */
function envelope(result: string, isError: boolean): void {
  process.stdout.write(
    `${JSON.stringify({
      type: "result",
      subtype: isError ? "error_during_execution" : "success",
      is_error: isError,
      api_error_status: null,
      result,
      duration_ms: isError ? 400 : 900,
      total_cost_usd: isError ? 0.0021 : 0.0177,
      usage: {
        input_tokens: 1421,
        output_tokens: isError ? 44 : 388,
        cache_read_input_tokens: 8192,
        cache_creation_input_tokens: 256,
      },
      modelUsage: { [`claude-${model || "sonnet"}-4-5[1m]`]: { costUSD: isError ? 0.0021 : 0.0177 } },
    })}\n`,
  );
}

if (task === "refusal") {
  // A refusal is an answer, not a crash: the run completed and said no, on
  // the line the prompt asked a refusal to end with. That line is what the
  // machine reads, and its reason is what the operator is owed.
  envelope(
    [
      "I cannot do that as asked.",
      JSON.stringify({ declined: "rewriting the ledger needs a decision nobody made" }),
    ].join("\n"),
    false,
  );
  process.exit(0);
}

if (task === "question") {
  // Nothing is written. The errand is a sentence, and the machine has to
  // recognise that a clean tree is a finished errand rather than a failure.
  envelope(
    "Yes: the nightly sync still reads the old bucket and writes the new one, so it can stay until the migration lands.",
    false,
  );
  process.exit(0);
}

if (task === "change") {
  // A real edit in the real checkout the prompt pointed at. The dependency
  // table is the change, and the commit that follows is amy's own.
  const manifest = path.join(process.cwd(), "api", "package.json");
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf-8")) as {
    dependencies: Record<string, string>;
  };
  parsed.dependencies["left-pad"] = "1.3.0";
  fs.writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");

  envelope("Raised left-pad in api from 1.0.0 to 1.3.0. Nothing else in the package was stale.", false);
  process.exit(0);
}

if (task === "committed") {
  // The same kind of job, done by an agent that commits as it goes: when the
  // workflow reaches for the tree there is nothing left in it to commit, and
  // the work is a commit only. It still has to be delivered.
  fs.writeFileSync(
    path.join(process.cwd(), "api", "CHANGELOG.md"),
    ["# Changelog", "", "## Unreleased", "", "- Raised left-pad to 1.3.0.", ""].join("\n"),
    "utf-8",
  );
  execFileSync("git", ["add", "-A"], { cwd: process.cwd(), stdio: "ignore" });
  execFileSync("git", ["commit", "-q", "-m", "docs: a changelog entry for the api package"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });

  envelope("Committed the changelog entry; the working tree is clean.", false);
  process.exit(0);
}

process.stderr.write(`the stand-in agent does not know this errand:\n${prompt}\n`);
process.exit(1);
