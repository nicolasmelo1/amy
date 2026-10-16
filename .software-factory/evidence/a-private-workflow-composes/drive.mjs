// The proof behind `a-private-workflow-composes`: every gap a private
// workflow had to fill itself, closed where the claim lives.
//
// Usage: node drive.mjs <repo> <amy-binary> <report-path> [--keep]
//
// Four parts, one report:
//   1. the built GitHub adapter, through the stand-in `gh` on the PATH
//   2. the built core `Git`, against real repositories
//   3. the built core mount and file queue, from this process
//   4. the installed `amy`, driving `ticket-to-qa` with its writes handed to
//      an operator, for a ticket that grows into a second repository
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [repo, binary, reportPath] = process.argv.slice(2);
const keep = process.argv.includes("--keep");
const world = path.join(repo, ".software-factory/evidence/ticket-to-qa");
const dist = (relative) => import(pathToFileURL(path.join(repo, relative)).href);
const { build, configure, headOf, lines, read, write, REPO, OTHER_REPO, TICKET, BRANCH, BOT } = await dist(
  ".software-factory/evidence/ticket-to-qa/world.mjs",
);
const core = await dist("packages/core/dist/index.js");
const { GitHubCodeHost } = await dist("plugins/github/dist/index.js");
const { FileQueue } = await dist("plugins/file-queue/dist/index.js");
const ticketToQa = await dist("packages/workflow-ticket-to-qa/dist/index.js");

const assertions = [];
const record = (type, ok, detail) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail ? { detail } : {}) });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-compose-"));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

/* 1. The adapter, through the stand-in gh. -------------------------------- */
{
  const root = path.join(scratch, "adapter");
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "origins"), { recursive: true });
  fs.copyFileSync(path.join(world, "bin", "gh"), path.join(root, "bin", "gh"));
  fs.chmodSync(path.join(root, "bin", "gh"), 0o755);
  const origin = path.join(root, "origins", "widgets.git");
  git(root, "init", "-q", "--bare", "--initial-branch=main", origin);
  const work = path.join(root, "work");
  git(root, "clone", "-q", origin, work);
  git(work, "-c", "user.email=amy@example.test", "-c", "user.name=amy", "commit", "-q", "--allow-empty", "-m", "first");
  git(work, "push", "-q", "origin", "main:main", "main:amy/bill-4021-renamed", "main:amy/bill-4021-old-name");
  const sha = git(work, "rev-parse", "HEAD");

  const pull = (number, title, head, extra = {}) => ({
    number, title, head, base: "main", state: "open", isDraft: false, reviewDecision: "REVIEW_REQUIRED",
    changedFiles: 1, additions: 1, deletions: 0, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "SUCCESS",
    requestedReviewers: [], reviews: [], threads: [], author: "amy", ...extra,
  });
  const state = {
    defaultBranch: "main",
    nextNumber: 90,
    statuses: { [sha]: [{ context: "ci/build", state: "pending" }] },
    repos: {
      [REPO]: {
        pulls: [
          pull(81, `${TICKET}: show the currency, as it was first called`, "amy/bill-4021-old-name", {
            threads: [{ id: "T-1", author: "ada", body: "Name the currency.", isResolved: false, isOutdated: false, path: "src/invoice/total.ts" }],
          }),
          pull(80, `${TICKET}: the first attempt`, "amy/bill-4021-renamed", { state: "merged", merged: true }),
          pull(82, "BILL-40210: another ticket entirely", "amy/bill-4021-renamed"),
          pull(83, "BILL-5000: asked to change", "amy/bill-4021-renamed", { reviewDecision: "CHANGES_REQUESTED", reviews: [{ author: "ada", state: "CHANGES_REQUESTED", commitSha: sha, submittedAt: "2026-09-03T10:00:00Z" }] }),
          pull(84, "BILL-5001: approved since", "amy/bill-4021-renamed", { reviewDecision: "APPROVED" }),
          pull(85, "BILL-5002: somebody else's", "amy/bill-4021-renamed", { author: "ada", reviewDecision: "CHANGES_REQUESTED" }),
        ],
      },
    },
  };
  fs.writeFileSync(path.join(root, "code-host.json"), JSON.stringify(state, null, 2));
  process.env.AMY_E2E_WORLD = root;
  process.env.AMY_E2E_ORIGINS = path.join(root, "origins");
  process.env.PATH = `${path.join(root, "bin")}:${process.env.PATH}`;
  const host = new GitHubCodeHost(new core.NodeCommandRunner());
  const setStatus = (statuses) => {
    const current = JSON.parse(fs.readFileSync(path.join(root, "code-host.json"), "utf-8"));
    current.statuses[sha] = statuses;
    fs.writeFileSync(path.join(root, "code-host.json"), JSON.stringify(current, null, 2));
  };

  const pending = await host.commitStatuses(REPO, sha);
  setStatus([{ context: "ci/build", state: "success" }]);
  const passing = await host.commitStatuses(REPO, sha);
  record("compose.a_lower_case_success_reads_as_passing", passing.length === 1 && passing[0].state === "passing", passing);
  setStatus([{ context: "ci/build", state: "failure" }, { context: "ci/lint", state: "error" }]);
  const failing = await host.commitStatuses(REPO, sha);
  record("compose.a_lower_case_failure_reads_as_failing", failing.length === 2 && failing.every((s) => s.state === "failing"), failing);

  // A reader waiting on the status: it holds while the forge says pending
  // and stops the look after the forge says success, as written.
  setStatus([{ context: "ci/build", state: "pending" }]);
  const looks = [];
  for (let look = 0; look < 5; look += 1) {
    const statuses = await host.commitStatuses(REPO, sha);
    const passed = statuses.length > 0 && statuses.every((s) => s.state === "passing");
    looks.push(passed ? "moved" : "held");
    if (passed) break;
    if (look === 1) setStatus([{ context: "ci/build", state: "success" }]);
  }
  record("compose.work_waiting_on_a_status_moves_when_it_passes", pending[0]?.state === "running" && looks.join(",") === "held,held,moved", looks);

  const renamed = await host.findPullRequest(REPO, "amy/bill-4021-show-the-currency-on-the-invoice-total");
  const byId = await host.findPullRequestMentioning(REPO, TICKET);
  record("compose.a_renamed_ticket_still_finds_its_pull_request", renamed === null && byId?.number === 81, { byBranch: renamed, byId: byId?.number });
  record("compose.a_review_thread_carries_the_file_it_is_on", byId?.threads[0]?.path === "src/invoice/total.ts", byId?.threads);

  const after = JSON.parse(fs.readFileSync(path.join(root, "code-host.json"), "utf-8"));
  after.repos[REPO].pulls = after.repos[REPO].pulls.filter((p) => p.number !== 81);
  fs.writeFileSync(path.join(root, "code-host.json"), JSON.stringify(after, null, 2));
  const merged = await host.findPullRequestMentioning(REPO, TICKET);
  record("compose.a_merged_pull_request_is_found_by_its_ticket", merged?.number === 80 && merged.merged === true, merged?.number);

  const asked = await host.authoredWithChangesRequested("amy", [REPO]);
  record("compose.changes_requested_are_found_from_the_authors_side", JSON.stringify(asked.map((r) => r.number)) === "[83]", asked.map((r) => r.number));

  /* The mount: a workflow that claims no writes reads ancestry, writes nothing. */
  const ctx = {};
  const workflowPlugin = {
    name: "@amykit/workflow-reader",
    version: "0.1.0",
    register: (registry, given) => {
      registry.workflow({ name: "reader", states: ["START", "DONE"], waitingStates: [], initialState: "START", terminalStates: ["DONE"], usesObservers: [], trackerWrites: [], codeHostWrites: [], plan: () => ({ kind: "settled", why: "reads only" }) });
      ctx.port = given.port;
    },
  };
  const hostPlugin = { name: "@amykit/plugin-github-under-test", version: "0.1.0", register: (registry) => registry.port("code-host", host) };
  const mounted = await core.mount([hostPlugin, workflowPlugin], {}, { runner: new core.NodeCommandRunner(), now: () => new Date(), paths: { workspace: root, checkouts: {}, state: path.join(root, ".amy") } });
  const view = ctx.port("code-host");
  const ancestry = await view.pullRequestAncestry?.(REPO, 80).catch((error) => String(error));
  record("compose.a_workflow_that_claims_no_writes_reads_ancestry", mounted.ok === true && typeof view.pullRequestAncestry === "function" && ancestry?.state === "merged", ancestry);
  const before = lines(path.join(root, "gh.log")).length;
  const refusals = [];
  for (const write of ["openPullRequest", "requestReview", "resolveReviewThread", "merge", "submitReview", "createIssue"]) {
    try {
      await view[write]?.({ repo: REPO, branch: "x", title: "x", body: "" });
      refusals.push(`${write}: not refused`);
    } catch (error) {
      if (!String(error).includes("claim")) refusals.push(`${write}: ${error}`);
    }
  }
  const after2 = lines(path.join(root, "gh.log")).length;
  record("compose.a_workflow_that_claims_no_writes_still_reaches_none", refusals.length === 0 && after2 === before, refusals);
}

/* 2. Commit and push, against real git. ---------------------------------- */
{
  const root = path.join(scratch, "git");
  const bare = path.join(root, "widgets.git");
  const checkout = path.join(root, "checkouts", "widgets");
  fs.mkdirSync(path.join(root, "checkouts"), { recursive: true });
  git(root, "init", "-q", "--bare", "--initial-branch=main", bare);
  git(root, "clone", "-q", bare, checkout);
  git(checkout, "config", "user.email", "amy@example.test");
  git(checkout, "config", "user.name", "amy");
  git(checkout, "commit", "-q", "--allow-empty", "-m", "first");
  git(checkout, "push", "-q", "origin", "main");
  const tip = (branch) => { try { return git(bare, "rev-parse", `refs/heads/${branch}`); } catch { return null; } };
  const g = new core.Git(new core.NodeCommandRunner(), { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" });

  await g.prepareBranch(REPO, "amy/item-1");
  fs.writeFileSync(path.join(checkout, "round-1.md"), "one\n");
  const committed = await g.commit(REPO, "round 1");
  record("compose.a_commit_without_a_push_leaves_the_remote_where_it_was", committed === true && tip("amy/item-1") === null);

  await g.push(REPO, "amy/item-1");
  const elsewhere = path.join(root, "elsewhere");
  git(root, "clone", "-q", "--branch", "amy/item-1", bare, elsewhere);
  git(elsewhere, "-c", "user.email=ada@example.test", "-c", "user.name=ada", "commit", "-q", "--allow-empty", "-m", "a suggestion committed on the forge");
  git(elsewhere, "push", "-q", "origin", "amy/item-1");
  const theirs = tip("amy/item-1");
  fs.writeFileSync(path.join(checkout, "round-2.md"), "two\n");
  await g.commit(REPO, "round 2");
  const ours = git(checkout, "rev-parse", "HEAD");
  let refusal = "";
  try { await g.push(REPO, "amy/item-1"); } catch (error) { refusal = String(error); }
  record("compose.a_push_that_is_not_a_fast_forward_is_refused_naming_the_branch", /refusing to push amy\/item-1.*not a fast-forward/.test(refusal), refusal);
  record("compose.a_refused_push_keeps_the_local_commit", git(checkout, "rev-parse", "HEAD") === ours && tip("amy/item-1") === theirs);

  await g.prepareBranch(REPO, "amy/item-2");
  fs.writeFileSync(path.join(checkout, "work.md"), "work\n");
  const delivered = await g.commitAndPush(REPO, "amy/item-2", "the work");
  record("compose.commit_and_push_still_delivers_in_one_call", delivered === true && tip("amy/item-2") === git(checkout, "rev-parse", "HEAD"));
}

/* 3. The queue, built, from this process and a fresh one. ----------------- */
{
  const dir = path.join(scratch, "queue");
  const now = new Date("2026-09-03T12:00:00.000Z");
  const at = (seconds) => new Date(now.getTime() + seconds * 1000);
  const drain = (queue) => { const out = []; for (let item = queue.claim(at(60)); item; item = queue.claim(at(60))) out.push(item.workId); return out; };

  const queue = new FileQueue(dir, "priority");
  queue.enqueue({ workId: "LOW", reason: "found", priority: 4 }, now);
  queue.enqueue({ workId: "URGENT", reason: "found", priority: 1 }, at(1));
  queue.enqueue({ workId: "NONE", reason: "found" }, at(2));
  const reopened = new FileQueue(dir, "priority");
  record("compose.the_queue_takes_the_most_urgent_first", JSON.stringify(drain(reopened)) === JSON.stringify(["URGENT", "LOW", "NONE"]));

  const fifo = new FileQueue(path.join(dir, "fifo"), "priority");
  for (const [index, name] of ["FIRST", "SECOND", "THIRD"].entries()) fifo.enqueue({ workId: name, reason: "found", priority: 2 }, at(index));
  record("compose.within_one_priority_the_queue_is_first_in_first_out", JSON.stringify(drain(fifo)) === JSON.stringify(["FIRST", "SECOND", "THIRD"]));

  // Refreshed the way discovery refreshes it: the engine, built, asking the
  // runtime what it found.
  const { Worker } = await dist("plugins/serial-engine/dist/index.js");
  const refreshed = new FileQueue(path.join(dir, "refreshed"), "priority");
  let found = [{ workId: "A", priority: 2 }, { workId: "B", priority: 3 }];
  const records = new Map();
  const worker = new Worker({
    queue: refreshed,
    records: { load: (id) => records.get(id) ?? null, save: (r) => records.set(r.id, r), all: () => [...records.values()] },
    workflow: { name: "toy", states: ["NEW"], waitingStates: [], initialState: "NEW", terminalStates: ["DONE"], usesObservers: [], plan: () => ({ kind: "settled", why: "" }) },
    runtime: { policy: {}, found: async () => found, newRecord: (id, t) => ({ id, state: "NEW", updatedAt: t.toISOString(), attempts: {}, history: [] }), observe: async () => ({}), actions: {}, apply: (r) => r },
    notifier: { announce: async () => {} },
    now: () => now,
    config: { staleClaimMs: 60000, retentionDays: 7, maxItemAttempts: 3, retryDelayMs: 0 },
  });
  await worker.discover();
  found = [{ workId: "A", priority: 2 }, { workId: "B", priority: 1 }];
  await worker.discover();
  record("compose.a_priority_refreshed_on_discovery_reorders_the_queue", JSON.stringify(drain(refreshed)) === JSON.stringify(["B", "A"]));

  const plain = new FileQueue(path.join(dir, "plain"));
  plain.enqueue({ workId: "LOW", reason: "found", priority: 4 }, now);
  plain.enqueue({ workId: "URGENT", reason: "found", priority: 1 }, at(1));
  record("compose.without_the_option_the_queue_keeps_id_order", JSON.stringify(drain(plain)) === JSON.stringify(["LOW", "URGENT"]));
}

/* The thread half of a hand-over, and the declaration, from the built workflow. */
{
  const posted = [];
  const announced = [];
  const runtime = ticketToQa.ticketRuntime({
    tracker: {}, host: {}, agent: {}, gate: {}, roster: () => ({}), git: {}, now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" },
    config: { repos: [REPO], qaStatusName: "In QA" },
    policy: { ...ticketToQa.DEFAULT_POLICY, writes: "operator" },
    notifier: { announce: async (a) => void announced.push(a.text) },
    conversation: { open: async () => ({ id: "T1" }), post: async (_t, m) => (posted.push(m.text), "m"), replies: async () => [] },
  });
  await runtime.actions["hand-over"](
    { type: "hand-over", turns: [{ key: "open-pull-request@x", write: { type: "open-pull-request" } }] },
    { record: { id: TICKET, state: "PR_OPEN" }, observation: { ticket: { id: TICKET, title: "t", repo: REPO, branchName: BRANCH, url: "u", labels: [], status: "In Progress" }, pullRequest: null }, outcomes: {} },
  );
  record("compose.a_handed_off_write_is_said_in_the_works_thread", posted.length === 1 && posted[0].includes("Open a pull request") && announced.length === 0, posted);

  const claims = [];
  ticketToQa.plugin.register({ workflow: (w) => claims.push(w), contribute: () => {} }, { config: { policy: { writes: "operator" } } });
  record("compose.handed_off_the_declaration_claims_no_writes", claims[0].trackerWrites.length === 0 && claims[0].codeHostWrites.length === 0 && !Object.keys(runtime.actions).some((name) => ["ask-question", "escalate", "open-pull-request", "resolve-review-thread", "assign-reviewer", "request-rereview", "hand-off-to-qa"].includes(name)));
}

/* 4. The installed machine, handing its writes to the operator. ----------- */
const lifecycle = installed();
record("compose.handed_off_nothing_is_written_on_the_tracker", lifecycle.trackerWrites.length === 0, lifecycle.trackerWrites);
record("compose.handed_off_nothing_is_written_on_the_code_host", lifecycle.ghWrites.length === 0, lifecycle.ghWrites);
record("compose.handed_off_the_ticket_still_reaches_qa", lifecycle.states.every((s) => s === "DONE") && lifecycle.ticketStatus === "In QA", { states: lifecycle.states, status: lifecycle.ticketStatus });
record("compose.a_handed_off_write_is_said_once", lifecycle.saidTwice.length === 0 && lifecycle.said.length > 0, { said: lifecycle.said, twice: lifecycle.saidTwice });
record("compose.with_no_thread_a_handed_off_write_goes_to_the_notifier", lifecycle.said.some((s) => s.includes("Open a pull request")) && lifecycle.said.some((s) => s.includes("Move ")));
record("compose.nothing_moves_until_the_handed_off_effect_is_observed", lifecycle.premature.length === 0 && lifecycle.made.length >= 5, { made: lifecycle.made, premature: lifecycle.premature });
record("compose.a_ticket_in_two_repositories_is_two_work_items", lifecycle.ids.length === 2 && lifecycle.ids.every((id) => id.startsWith(`${TICKET}@`)), lifecycle.ids);
record("compose.each_repository_walks_in_its_own_tree", lifecycle.ownTrees, lifecycle.trees);
record("compose.qa_waits_while_one_repository_is_unmerged", lifecycle.heldForMerge >= 2, lifecycle.heldForMerge);
record("compose.qa_receives_the_ticket_once_when_every_repository_is_merged", lifecycle.qaTurns === 1 && lifecycle.qaBeforeEveryMerge === false, { qaTurns: lifecycle.qaTurns });
record("compose.a_repository_added_late_is_a_new_work_item_qa_waits_for", lifecycle.lateDiscovered && lifecycle.waitedForLate, { late: lifecycle.lateDiscovered, waited: lifecycle.waitedForLate });

function installed() {
  const root = path.join(scratch, "installed");
  fs.mkdirSync(root, { recursive: true });
  build(root, { source: world });
  const tracker = startTracker(root);
  const home = path.join(root, "home");
  const amy = (...args) => {
    const result = spawnSync(binary, args, {
      cwd: home, encoding: "utf-8",
      env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, HOME: home, AMY_E2E_WORLD: path.join(root, "world"), AMY_E2E_ORIGINS: path.join(root, "origins") },
    });
    return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
  };
  const trackerFile = path.join(root, "world", "tracker.json");
  const hostFile = path.join(root, "world", "code-host.json");
  const inbox = path.join(home, ".amy", "needs-input");
  const recordsDir = path.join(home, ".amy", "tickets", "records");
  const idFor = (r) => ticketToQa.workIdFor(TICKET, r);
  const recordOf = (id) => { const file = path.join(recordsDir, `${id}.json`); return fs.existsSync(file) ? read(file) : null; };

  try {
    amy("init");
    configure(root, tracker.endpoint);
    operatorConfig(root, tracker.endpoint);
    installPlugins(root);
    amy("roster", "confirm");

    // Only the widgets half is known at first, and nobody else's reviews
    // sit on the pile, so the walk is about the handover and the join.
    const t = read(trackerFile);
    t.issues = t.issues.filter((issue) => issue.identifier === TICKET);
    t.issues[0].labels = ["Bug", "widgets"];
    write(trackerFile, t);
    const h = read(hostFile);
    for (const entry of Object.values(h.repos)) entry.pulls = [];
    write(hostFile, h);

    const out = { said: [], saidTwice: [], made: [], premature: [], heldForMerge: 0, qaTurns: 0, qaBeforeEveryMerge: false, lateDiscovered: false, waitedForLate: false };
    const seen = new Set();
    const heard = new Set();
    const pending = [];
    let previous = "";
    let stalled = 0;

    amy("discover");
    for (let tick = 0; tick < 200; tick += 1) {
      const result = amy("tick");
      if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
      const ids = fs.existsSync(recordsDir) ? fs.readdirSync(recordsDir).map((f) => f.replace(/\.json$/, "")) : [];
      const snapshot = ids.map((id) => `${id}:${recordOf(id)?.state}`).sort().join(" ");
      if (ids.length > 0 && ids.every((id) => recordOf(id)?.state === "DONE")) break;
      stalled = snapshot === previous ? stalled + 1 : 0;
      previous = snapshot;

      // Everything the machine said, read once, as the operator reads it.
      for (const file of fs.existsSync(inbox) ? fs.readdirSync(inbox).sort() : []) {
        if (heard.has(file)) continue;
        heard.add(file);
        const text = fs.readFileSync(path.join(inbox, file), "utf-8");
        const said = text.split("\n").slice(5, -3).join("\n").trim();
        const workId = text.split("\n")[0].replace(/^# /, "");
        const state = /^State: (\S+)/m.exec(text)?.[1];
        out.said.push(said);
        const key = `${workId}|${said}`;
        if (seen.has(key)) out.saidTwice.push(said);
        seen.add(key);
        if (said.startsWith("Move ")) {
          out.qaTurns += 1;
          const pulls = read(hostFile);
          out.qaBeforeEveryMerge ||= Object.values(pulls.repos).some((entry) => entry.pulls.some((p) => p.state === "open"));
        }
        pending.push({ workId, state, said });
      }

      if (stalled < 2) continue;
      stalled = 0;
      react(ids);
    }

    const finalIds = fs.readdirSync(recordsDir).map((f) => f.replace(/\.json$/, ""));
    out.ids = finalIds.map((f) => decodeURIComponent(f));
    out.states = finalIds.map((id) => recordOf(id)?.state);
    out.ticketStatus = read(trackerFile).issues[0].stateId === "s-qa" ? "In QA" : read(trackerFile).issues[0].stateId;
    out.trackerWrites = lines(path.join(root, "world", "tracker.log")).filter((l) => /mutation/i.test(l.query ?? "")).map((l) => l.operation);
    out.ghWrites = lines(path.join(root, "world", "gh.log")).map((l) => l.argv.join(" ")).filter((argv) => /--method (POST|PUT|PATCH|DELETE)|mutation /.test(argv));
    out.trees = [REPO, OTHER_REPO].map((r) => ({ repo: r, head: headOf(root, r.split("/")[1], BRANCH) }));
    out.ownTrees = out.trees.every((tree) => tree.head) && out.trees[0].head !== out.trees[1].head &&
      git(root, "--git-dir", path.join(root, "origins", "widgets.git"), "ls-tree", "--name-only", BRANCH).includes("invoice.md") &&
      git(root, "--git-dir", path.join(root, "origins", "gadgets.git"), "ls-tree", "--name-only", BRANCH).includes("credit-note.md");
    out.lateDiscovered &&= Boolean(recordOf(idFor(OTHER_REPO)));
    return out;

    /** The operator and the reviewers, when the machine has stopped moving. */
    function react(ids) {
      // The operator carries out what they were told, in the order they were told it.
      for (const turn of pending.splice(0)) {
        const current = recordOf(turn.workId)?.state;
        const made = operate(turn);
        if (!made) continue;
        out.made.push(`${turn.workId} ${current}: ${made}`);
        // A turn made while the machine was already past where it said it
        // would wait is a machine that did not wait for it.
        // A question or an escalation is said on the move into the state
        // that waits for its answer, so only the other turns are held to it.
        const movesOnItsOwn = /needs an answer|needs your call/.test(turn.said);
        if (current !== turn.state && !movesOnItsOwn) out.premature.push(`${turn.workId}: said in ${turn.state}, already ${current}`);
      }

      const hostState = read(hostFile);
      for (const id of ids) {
        const rec = recordOf(id);
        const repoName = decodeURIComponent(id.slice(id.indexOf("@") + 1));
        const pull = hostState.repos[repoName]?.pulls.find((p) => p.head === BRANCH);
        if (!pull || !rec) continue;
        const head = headOf(root, repoName.split("/")[1], BRANCH);
        if (rec.state === "COPILOT_WAIT" && !pull.reviews.some((r) => r.author === BOT && r.commitSha === head)) {
          const first = pull.reviews.every((r) => r.author !== BOT);
          pull.reviews.push({ author: BOT, state: "COMMENTED", commitSha: head, submittedAt: new Date().toISOString() });
          if (first && repoName === REPO) pull.threads.push({ id: "BOT-1", author: BOT, body: "This file has no trailing newline.", isResolved: false, isOutdated: false, path: "invoice.md" });
        }
        if (rec.state === "HUMAN_REVIEW" && rec.reviewer && pull.requestedReviewers.includes(rec.reviewer)) {
          pull.reviewDecision = "APPROVED";
          pull.requestedReviewers = pull.requestedReviewers.filter((w) => w !== rec.reviewer);
          pull.reviews.push({ author: rec.reviewer, state: "APPROVED", commitSha: head, submittedAt: new Date().toISOString() });
        }
        // Widgets merges as soon as it is waiting; gadgets only after the
        // widgets item has been seen holding for it, so the join must wait.
        if (rec.state === "QA_HANDOFF" && pull.state === "open" && (repoName === REPO || out.heldForMerge >= 2)) {
          pull.state = "merged";
          pull.merged = true;
        }
        const late = hostState.repos[OTHER_REPO]?.pulls.find((p) => p.head === BRANCH);
        if (repoName === REPO && rec.state === "QA_HANDOFF" && pull.merged && !late?.merged) out.heldForMerge += 1;
      }
      write(hostFile, hostState);

      // The ticket grows a second repository once the first is under way.
      const first = recordOf(idFor(REPO));
      if (!out.lateDiscovered && first && ["COPILOT_WAIT", "REVIEWER_ASSIGNED", "HUMAN_REVIEW", "APPROVED", "QA_HANDOFF"].includes(first.state)) {
        const t2 = read(trackerFile);
        t2.issues[0].labels.push("gadgets");
        write(trackerFile, t2);
        amy("discover");
        out.lateDiscovered = true;
      }
      if (first?.state === "QA_HANDOFF") {
        const late = recordOf(idFor(OTHER_REPO));
        if (late && late.state !== "DONE") out.waitedForLate = true;
      }
    }

    function operate({ workId, said }) {
      const repoName = decodeURIComponent(workId.slice(workId.indexOf("@") + 1));
      if (said.includes("needs an answer")) {
        const t3 = read(trackerFile);
        t3.issues[0].comments.push({ body: "In BRL, the same as the rest of the invoice.", createdAt: new Date().toISOString(), userId: "u-owner" });
        write(trackerFile, t3);
        return "answered on the ticket";
      }
      const hostState = read(hostFile);
      const pulls = hostState.repos[repoName].pulls;
      if (said.startsWith("Open a pull request")) {
        const title = /titled "([^"]+)"/.exec(said)[1];
        pulls.push({ number: hostState.nextNumber++, title, head: BRANCH, base: "main", state: "open", isDraft: false, reviewDecision: "REVIEW_REQUIRED", changedFiles: 1, additions: 3, deletions: 0, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "SUCCESS", requestedReviewers: [], reviews: [], threads: [], author: "amy" });
        write(hostFile, hostState);
        return "opened the pull request";
      }
      if (said.startsWith("Resolve the review thread")) {
        for (const pull of pulls) pull.threads = pull.threads.map((thread) => (said.includes(thread.path ?? "\u0000") ? { ...thread, isResolved: true } : thread));
        write(hostFile, hostState);
        return "resolved the thread";
      }
      const review = /^Request a review of \S+ from (\S+)\.$|^Ask (\S+) to review/.exec(said);
      if (review) {
        const who = review[1] ?? review[2];
        for (const pull of pulls.filter((p) => p.head === BRANCH)) if (!pull.requestedReviewers.includes(who)) pull.requestedReviewers.push(who);
        write(hostFile, hostState);
        return `requested a review from ${who}`;
      }
      if (said.startsWith("Move ")) {
        const t4 = read(trackerFile);
        t4.issues[0].stateId = "s-qa";
        t4.issues[0].assigneeId = "u-grace";
        write(trackerFile, t4);
        return "moved the ticket to QA";
      }
      return null;
    }
  } finally {
    tracker.child.kill();
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
    else console.log(`kept the world in ${root}`);
  }
}


function startTracker(root) {
  const stateFile = path.join(root, "world", "tracker.json");
  const portFile = path.join(root, "world", "tracker.port");
  const child = spawn(process.execPath, [path.join(world, "tracker.mjs"), stateFile, portFile], { stdio: "ignore" });
  if (process.env.AMY_E2E_PIDFILE) fs.appendFileSync(process.env.AMY_E2E_PIDFILE, `${child.pid}\n`);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(portFile)) {
    if (Date.now() > deadline) throw new Error("the stand-in tracker never listened");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  return { child, endpoint: `http://127.0.0.1:${fs.readFileSync(portFile, "utf-8").trim()}/graphql` };
}

/** The world's config, with the writes handed to the operator and a label per repository. */
function operatorConfig(root, endpoint) {
  const file = path.join(root, "home", ".amy", "config.yaml");
  let text = fs.readFileSync(file, "utf-8");
  text = text.replace("  rosterBackoffMs: 0\n", "  rosterBackoffMs: 0\n  writes: operator\n");
  text = text.replace(`    defaultRepo: ${REPO}\n`, `    defaultRepo: ${REPO}\n    repoByLabel:\n      widgets: ${REPO}\n      gadgets: ${OTHER_REPO}\n`);
  if (!text.includes("writes: operator") || !text.includes("repoByLabel")) throw new Error("the world's config moved; the operator edit no longer applies");
  void endpoint;
  fs.writeFileSync(file, text, "utf-8");
}

function installPlugins(root) {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })),
  }));
  const prefix = path.join(root, "home", ".amy", "plugins");
  const overrides = Object.fromEntries(packed.filter(({ manifest }) => manifest.name !== "@amykit/cli").map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies: overrides, overrides }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`could not install the packaged plugins: ${result.stderr}`);
}

const failed = assertions.filter((assertion) => assertion.status !== "passed");
for (const assertion of failed) process.stderr.write(`FAILED ${assertion.type} ${JSON.stringify(assertion.detail ?? "")}\n`);
fs.writeFileSync(reportPath, `${JSON.stringify({
  scenario: "a-private-workflow-composes",
  status: failed.length === 0 ? "passed" : "failed",
  goal: "Prove a private workflow can compose the shipped one: statuses read as written, a commit that is not a push, threads that know their file, lookups by ticket, a workflow that claims no writes still reads, a queue in priority order, and ticket-to-qa walking a ticket across two repositories to QA with every write handed to the operator.",
  artifact: { package: "@amykit/cli", entry: "the installed amy, and the built dist of core, github, file-queue, serial-engine and ticket-to-qa" },
  observed: { assertions_run: assertions.length, assertions_failed: failed.length, node: process.version },
  assertions,
}, null, 2)}\n`);
if (!keep) fs.rmSync(scratch, { recursive: true, force: true });
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length) process.exit(1);
