// The proof behind `plugin-next-steps`: the installed amy, driving
// `ticket-to-qa` from a next-steps table instead of a tracker, takes the
// table's first committed row, walks it to a pull request in the repository
// the row's plan lives in, and writes nothing anywhere a tracker would have
// been.
//
// Usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]
//
// The world is the ticket-to-qa scenario's — real repositories, the stand-in
// `gh` and agent — with no tracker in it at all: the table is the tracker.
// The writes are handed to the operator, who opens the pull request when told.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build, editRoster, read, write, type CodeHost } from "../ticket-to-qa/world.js";

const [repo = "", binary = "", reportPath = ""] = process.argv.slice(2);
if (!repo || !binary || !reportPath) {
  console.error("usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const world = path.join(repo, ".software-factory/evidence/ticket-to-qa");

const WIDGETS = "acme/widgets";
const FIRST = "show-the-currency-on-the-invoice-total";
const SECOND = "round-nothing-on-the-invoice";
const HALF_WRITTEN = "a-row-somebody-is-still-writing";
const BRANCH = `plan/${FIRST}`;
const TABLE = "plans/next-steps.md";

interface Assertion { type: string; status: "passed" | "failed"; detail?: unknown }
const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail?: unknown) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail === undefined ? {} : { detail }) });

const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-next-steps-"));
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const origin = path.join(root, "origins", "widgets.git");
const standing = path.join(root, "checkouts", "widgets");
const home = path.join(root, "home");
const recordsDir = path.join(home, ".amy", "tickets", "records");
const inbox = path.join(home, ".amy", "needs-input");
const hostFile = path.join(root, "world", "code-host.json");

const amy = (...args: string[]) => {
  const result = spawnSync(binary, args, {
    cwd: home, encoding: "utf-8",
    env: { ...process.env, AMY_E2E_TSX: path.join(repo, "node_modules", ".bin", "tsx"), PATH: `${path.join(root, "bin")}:${process.env.PATH}`, HOME: home, AMY_E2E_WORLD: path.join(root, "world"), AMY_E2E_ORIGINS: path.join(root, "origins") },
  });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
};

try {
  build(root, { source: world });
  // Nothing here reads a tracker key, and no tracker answers on any socket.
  fs.rmSync(path.join(home, ".env"), { force: true });
  // The agent finds the plan clear: a plan has no thread to ask a question on.
  write(path.join(root, "world", "agent.json"), { file: "invoice.md", currency: "BRL", triage: { clear: true, questions: [] }, verdicts: {} });

  // The order, merged on the base branch: two rows, each a plan beside it.
  const plan = (title: string) => `---\nexit: "${title.toLowerCase()}"\n---\n# ${title}\n\nShow the currency beside the invoice total.\n`;
  for (const [file, text] of Object.entries({
    [TABLE]: `# Next steps\n\n| # | Work | Exit condition |\n| --- | --- | --- |\n| 1 | [Show the currency](${FIRST}.md) | the total says BRL |\n| 2 | [Round nothing](${SECOND}.md) | nothing is rounded |\n`,
    [`plans/${FIRST}.md`]: plan("Show the currency on the invoice total"),
    [`plans/${SECOND}.md`]: plan("Round nothing on the invoice"),
  })) {
    fs.mkdirSync(path.dirname(path.join(standing, file)), { recursive: true });
    fs.writeFileSync(path.join(standing, file), text);
  }
  git(standing, "add", "-A");
  git(standing, "commit", "-q", "-m", "the order");
  git(standing, "push", "-q", "origin", "main");
  const tableAtStart = git(standing, "--git-dir", origin, "rev-parse", `main:${TABLE}`);

  // Somebody is editing the order in the standing checkout and has not
  // committed: a row on top, and its plan. Not work yet.
  const dirtyTable = fs.readFileSync(path.join(standing, TABLE), "utf-8").replace("| 1 |", `| 0 | [Still writing](${HALF_WRITTEN}.md) | not yet |\n| 1 |`);
  fs.writeFileSync(path.join(standing, TABLE), dirtyTable);
  fs.writeFileSync(path.join(standing, `plans/${HALF_WRITTEN}.md`), plan("A row somebody is still writing"));
  const standingHead = git(standing, "rev-parse", "HEAD");

  amy("init");
  configure();
  installPlugins();
  editRoster(root);
  amy("roster", "confirm");

  const doctor = amy("doctor");
  record("next_steps.the_declaration_claims_no_tracker_writes", /read-only: it cannot write the tracker or code host/.test(doctor.out), doctor.out.split("\n").filter((line) => /write surface|next-steps|tracker/i.test(line)));

  const said: string[] = [];
  const heard = new Set<string>();
  let opened = false;
  amy("discover");
  for (let tick = 0; tick < 80; tick += 1) {
    const result = amy("tick");
    if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
    for (const file of fs.existsSync(inbox) ? fs.readdirSync(inbox).sort() : []) {
      if (heard.has(file)) continue;
      heard.add(file);
      const text = fs.readFileSync(path.join(inbox, file), "utf-8").split("\n").slice(5, -3).join("\n").trim();
      said.push(text);
      if (text.startsWith("Open a pull request") && !opened) opened = openPullRequest(text);
    }
    if (opened && stateOf(FIRST) === "COPILOT_WAIT") break;
  }

  const ids = fs.existsSync(recordsDir) ? fs.readdirSync(recordsDir).map((file) => decodeURIComponent(file.replace(/\.json$/, ""))) : [];
  // The first row the base branch holds, not the one being written on top of
  // it in the standing checkout, which is left exactly as its owner left it.
  const untouched = git(standing, "rev-parse", "HEAD") === standingHead && fs.readFileSync(path.join(standing, TABLE), "utf-8") === dirtyTable;
  record("next_steps.the_first_committed_row_is_the_work",
    ids.length === 1 && ids[0] === FIRST && !said.some((text) => text.includes(HALF_WRITTEN)) && untouched,
    { ids, untouched });

  // Pushed to the plan's repository, opened there, observed, and carrying the agent's work.
  const pushed = git(root, "--git-dir", origin, "branch", "--list", BRANCH);
  const pulls = read<CodeHost>(hostFile).repos[WIDGETS]?.pulls.filter((pull) => pull.head === BRANCH) ?? [];
  const carried = pushed !== "" && git(root, "--git-dir", origin, "show", `${BRANCH}:invoice.md`).includes("BRL");
  record("next_steps.the_row_walks_to_a_pull_request_in_its_plans_repository",
    carried && pulls.length === 1 && stateOf(FIRST) === "COPILOT_WAIT",
    { pushed, carried, pulls: pulls.map((pull) => pull.title), state: stateOf(FIRST) });

  const trackerTurns = said.filter((text) => /^(Move |Assign |Comment |Create a follow-up)/.test(text));
  record("next_steps.nothing_is_written_where_a_tracker_would_have_been",
    trackerTurns.length === 0 && git(root, "--git-dir", origin, "rev-parse", `main:${TABLE}`) === tableAtStart && !fs.existsSync(path.join(root, "world", "tracker.log")),
    { trackerTurns, said });
} catch (error) {
  record("next_steps.the_scenario_ran", false, error instanceof Error ? error.message : String(error));
} finally {
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
  else console.log(`kept the world in ${root}`);
}

function stateOf(id: string): string | undefined {
  const file = path.join(recordsDir, `${encodeURIComponent(id)}.json`);
  return fs.existsSync(file) ? read<{ state: string }>(file).state : undefined;
}

/** The operator, doing what they were told: the pull request, from the branch the machine pushed. */
function openPullRequest(text: string): boolean {
  const title = /titled "([^"]+)"/.exec(text)?.[1];
  if (!title || !text.includes(`from ${BRANCH} into main`) || !text.includes(`in ${WIDGETS}`)) return false;
  const hosted = read<CodeHost>(hostFile);
  const entry = hosted.repos[WIDGETS];
  if (!entry) return false;
  entry.pulls = entry.pulls.filter((pull) => pull.head !== BRANCH);
  entry.pulls.push({ number: hosted.nextNumber++, title, body: "", head: BRANCH, base: "main", state: "open", isDraft: false, reviewDecision: "REVIEW_REQUIRED", changedFiles: 1, additions: 3, deletions: 0, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "SUCCESS", requestedReviewers: [], reviews: [], threads: [] });
  write(hostFile, hosted);
  return true;
}

/** The config an operator writes for a table: ticket-to-qa, the next-steps tracker in Linear's place, every write handed over. */
function configure(): void {
  const plugins = [
    "@amykit/plugin-file-queue", "@amykit/plugin-file-store", "@amykit/plugin-file-notes",
    "@amykit/plugin-github", "@amykit/plugin-next-steps", "@amykit/workflow-ticket-to-qa",
    "@amykit/plugin-file-worktree", "@amykit/plugin-claude", "@amykit/plugin-agent-relay",
    "@amykit/plugin-notify-fanout", "@amykit/plugin-notify-inbox", "@amykit/plugin-serial-engine",
    "@amykit/plugin-command-gate",
  ];
  fs.writeFileSync(path.join(home, ".amy", "config.yaml"), `workflows:
  tickets:
    workflow: "@amykit/workflow-ticket-to-qa"
    plugins:
${plugins.map((name) => `      - "${name}"`).join("\n")}
defaultWorkflow: tickets

autoUpdate:
  enabled: false

repos:
  - ${WIDGETS}

workingStatusName: ${"ready"}
# A row's plan moved to docs/design/ by a merged pull request is delivered.
qaStatusName: delivered

policy:
  maxOpenReviewsPerReviewer: 2
  pollBackoffMs: 0
  rosterBackoffMs: 0
  writes: operator

workspaceRoot: ${path.join(root, "checkouts")}
defaultBranch: main
worktrees:
  root: ${path.join(root, "worktrees")}
  retentionDays: 0

gate:
  ${WIDGETS}:
    - test -f invoice.md
    - grep -q "currency:" invoice.md

agent:
  model: sonnet
  budget:
    perFiveHours: { tokens: 20000000, costUsd: 50 }
    perWeek: { tokens: 100000000, costUsd: 200 }
    stopAt: 0.9

notify:
  hermes: null
  inbox: true

plugins:
  "@amykit/plugin-next-steps":
    repo: ${WIDGETS}
`, "utf-8");
}

function installPlugins(): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
  }));
  const prefix = path.join(home, ".amy", "plugins");
  const overrides = Object.fromEntries(packed.filter(({ manifest }) => manifest.name !== "@amykit/cli").map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies: overrides, overrides }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`could not install the packaged plugins: ${result.stderr}`);
}

const failed = assertions.filter((assertion) => assertion.status !== "passed");
const report = {
  scenario: "plugin-next-steps",
  goal: "Prove ticket-to-qa, mounted on a next-steps table through the installed executable, takes the first committed row from the base branch, walks it to a pull request in the plan's repository, and writes nothing where a tracker would have been.",
  status: failed.length === 0 ? "passed" : "failed",
  assertions,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
for (const assertion of assertions) console.log(`${assertion.status === "passed" ? "✓" : "✗"} ${assertion.type}${assertion.status === "passed" ? "" : ` ${JSON.stringify(assertion.detail)}`}`);
process.exit(failed.length === 0 ? 0 : 1);
