// The proof behind `a-private-workflow-composes`: every gap a private
// workflow had to fill itself, closed where the claim lives.
//
// Usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]
//
// Four parts, one report:
//   1. the built GitHub adapter, through the stand-in `gh` on the PATH
//   2. the built core `Git`, against real repositories
//   3. the built core mount and file queue, from this process
//   4. the installed `amy`, driving `ticket-to-qa` with its writes handed to
//      an operator, for a ticket that grows into a second repository
import type { CodeHost, Conversation, Plan, Plugin, PluginContext, PullRequestView, Queue, QueueItem, Registry, Tracker, Workflow, WorkflowRuntime, WorkRecord } from "@amykit/core";
import type { Effect, Observation, Roster, TicketRecord } from "@amykit/workflow-ticket-to-qa";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  build,
  configure,
  editRoster,
  found as existing,
  headOf,
  lines,
  read,
  write,
  REPO,
  OTHER_REPO,
  TICKET,
  BRANCH,
  BOT,
  type CodeHost as HostState,
  type Pull as WorldPull,
  type Thread as WorldThread,
  type TrackerState,
} from "../ticket-to-qa/world.js";

const [repo = "", binary = "", reportPath = ""] = process.argv.slice(2);
if (repo === "" || binary === "" || reportPath === "") {
  console.error("usage: drive.ts <repo> <amy-binary> <report-path> [--keep]");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const world = path.join(repo, ".software-factory/evidence/ticket-to-qa");
const dist = (relative: string): Promise<unknown> => import(pathToFileURL(path.join(repo, relative)).href);
const core = (await dist("packages/core/dist/index.js")) as typeof import("@amykit/core");
const { GitHubCodeHost } = (await dist("plugins/github/dist/index.js")) as typeof import("@amykit/plugin-github");
const { FileQueue } = (await dist("plugins/file-queue/dist/index.js")) as typeof import("@amykit/plugin-file-queue");
const { Worker } = (await dist("plugins/serial-engine/dist/index.js")) as typeof import("@amykit/plugin-serial-engine");
const ticketToQa = (await dist("packages/workflow-ticket-to-qa/dist/index.js")) as typeof import("@amykit/workflow-ticket-to-qa");
// The workflow as the host mounts it, shaped by the diagram at its package root.
const drawnTicketToQa = core.withDiagramBeside(ticketToQa.plugin, pathToFileURL(path.join(repo, "packages/workflow-ticket-to-qa/dist/index.js")));

/** A thread and a pull request as this run writes them, with what the shared world leaves out. */
type Thread = WorldThread & { path?: string };
type Pull = Omit<WorldPull, "body" | "threads"> & { body?: string; threads: Thread[]; merged?: boolean; author?: string };
type Hosted = Omit<HostState, "repos"> & { repos: Record<string, { pulls: Pull[] }> };

/**
 * A port of which only what is given is ever reached. Anything else is
 * missing, as it was when the stand-in was a bare object, and reaching it
 * is the TypeError that fails the run.
 */
const standIn = <T extends object>(given: Partial<T> = {}): T => given as T;

/** What a plan moves to, and the key of the first turn it hands over, whatever its kind. */
const toOf = (p: Plan): string | undefined => (p.kind === "advance" ? p.to : undefined);
const firstTurn = (p: Plan): string | undefined => {
  const effect = "effects" in p ? p.effects[0] : undefined;
  return effect?.type === "hand-over" ? (effect as Extract<Effect, { type: "hand-over" }>).turns[0]?.key : undefined;
};

interface Assertion {
  readonly type: string;
  readonly status: "passed" | "failed";
  readonly detail?: unknown;
}

const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail?: unknown) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail ? { detail } : {}) });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-compose-"));
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

/* 1. The adapter, through the stand-in gh. -------------------------------- */
{
  const root = path.join(scratch, "adapter");
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "origins"), { recursive: true });
  fs.copyFileSync(path.join(world, "bin", "gh"), path.join(root, "bin", "gh"));
  fs.copyFileSync(path.join(world, "bin", "gh.ts"), path.join(root, "bin", "gh.ts"));
  fs.chmodSync(path.join(root, "bin", "gh"), 0o755);
  const origin = path.join(root, "origins", "widgets.git");
  git(root, "init", "-q", "--bare", "--initial-branch=main", origin);
  const work = path.join(root, "work");
  git(root, "clone", "-q", origin, work);
  git(work, "-c", "user.email=amy@example.test", "-c", "user.name=amy", "commit", "-q", "--allow-empty", "-m", "first");
  git(work, "push", "-q", "origin", "main:main", "main:amy/bill-4021-renamed", "main:amy/bill-4021-old-name");
  const sha = git(work, "rev-parse", "HEAD");

  const pull = (number: number, title: string, head: string, extra: Partial<Pull> = {}): Pull => ({
    number, title, head, base: "main", state: "open", isDraft: false, reviewDecision: "REVIEW_REQUIRED",
    changedFiles: 1, additions: 1, deletions: 0, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "SUCCESS",
    requestedReviewers: [], reviews: [], threads: [], author: "amy", ...extra,
  });
  const state: Hosted & { statuses: Record<string, { context: string; state: string }[]> } = {
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
  // The stand-ins are TypeScript, run by this checkout's tsx wherever they are copied.
  process.env.AMY_E2E_TSX = path.join(repo, "node_modules", ".bin", "tsx");
  const host = new GitHubCodeHost(new core.NodeCommandRunner());
  const setStatus = (statuses: { context: string; state: string }[]) => {
    const current = read<typeof state>(path.join(root, "code-host.json"));
    current.statuses[sha] = statuses;
    fs.writeFileSync(path.join(root, "code-host.json"), JSON.stringify(current, null, 2));
  };

  const pending = await host.commitStatuses(REPO, sha);
  setStatus([{ context: "ci/build", state: "success" }]);
  const passing = await host.commitStatuses(REPO, sha);
  record("compose.a_lower_case_success_reads_as_passing", passing.length === 1 && passing[0]?.state === "passing", passing);
  setStatus([{ context: "ci/build", state: "failure" }, { context: "ci/lint", state: "error" }]);
  const failing = await host.commitStatuses(REPO, sha);
  record("compose.a_lower_case_failure_reads_as_failing", failing.length === 2 && failing.every((s) => s.state === "failing"), failing);

  // A reader waiting on the status: it holds while the forge says pending
  // and stops the look after the forge says success, as written.
  setStatus([{ context: "ci/build", state: "pending" }]);
  const looks: string[] = [];
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

  const after = read<typeof state>(path.join(root, "code-host.json"));
  const widgets = after.repos[REPO];
  if (widgets) widgets.pulls = widgets.pulls.filter((p) => p.number !== 81);
  fs.writeFileSync(path.join(root, "code-host.json"), JSON.stringify(after, null, 2));
  const merged = await host.findPullRequestMentioning(REPO, TICKET);
  record("compose.a_merged_pull_request_is_found_by_its_ticket", merged?.number === 80 && merged.merged === true, merged?.number);

  const asked = await host.authoredWithChangesRequested("amy", [REPO]);
  record("compose.changes_requested_are_found_from_the_authors_side", JSON.stringify(asked.map((r) => r.number)) === "[83]", asked.map((r) => r.number));

  /* The mount: a workflow that claims no writes reads ancestry, writes nothing. */
  const ctx: Partial<Pick<PluginContext, "port">> = {};
  const workflowPlugin: Plugin = {
    name: "@amykit/workflow-reader",
    register: (registry, given) => {
      registry.workflow({ name: "reader", states: ["START", "DONE"], waitingStates: [], initialState: "START", terminalStates: ["DONE"], trackerWrites: [], codeHostWrites: [], plan: () => ({ kind: "settled", why: "reads only" }) });
      ctx.port = given.port;
    },
  };
  const hostPlugin: Plugin = { name: "@amykit/plugin-github-under-test", register: (registry) => registry.port("code-host", host) };
  const mounted = await core.mount([hostPlugin, workflowPlugin], {}, { runner: new core.NodeCommandRunner(), now: () => new Date(), paths: { workspace: root, checkouts: {}, state: path.join(root, ".amy") } });
  const view = ctx.port?.("code-host") as (Partial<CodeHost> & Record<string, unknown>) | undefined;
  const ancestry = await view?.pullRequestAncestry?.(REPO, 80).catch((error: unknown) => String(error));
  record("compose.a_workflow_that_claims_no_writes_reads_ancestry", mounted.ok === true && typeof view?.pullRequestAncestry === "function" && typeof ancestry === "object" && ancestry?.state === "merged", ancestry);
  const before = lines(path.join(root, "gh.log")).length;
  const refusals: string[] = [];
  for (const write of ["openPullRequest", "requestReview", "resolveReviewThread", "merge", "submitReview", "createIssue"]) {
    try {
      const method = view?.[write];
      if (typeof method === "function") await method.call(view, { repo: REPO, branch: "x", title: "x", body: "" });
      refusals.push(`${write}: not refused`);
    } catch (error) {
      if (!String(error).includes("claim")) refusals.push(`${write}: ${String(error)}`);
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
  const tip = (branch: string): string | null => { try { return git(bare, "rev-parse", `refs/heads/${branch}`); } catch { return null; } };
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

  git(checkout, "checkout", "-q", "-b", "amy/item-1-child", "origin/amy/item-1");
  const cut = git(checkout, "rev-parse", "HEAD");
  const published = await g.push(REPO, "amy/item-1-child");
  const again = await g.push(REPO, "amy/item-1-child");
  record("compose.a_new_branch_at_a_pushed_commit_is_published", published === true && again === false && tip("amy/item-1-child") === cut, { published, again, tip: tip("amy/item-1-child"), cut });

  await g.prepareBranch(REPO, "amy/item-2");
  fs.writeFileSync(path.join(checkout, "work.md"), "work\n");
  const delivered = await g.commitAndPush(REPO, "amy/item-2", "the work");
  record("compose.commit_and_push_still_delivers_in_one_call", delivered === true && tip("amy/item-2") === git(checkout, "rev-parse", "HEAD"));
}

/* 3. The queue, built, from this process and a fresh one. ----------------- */
{
  const dir = path.join(scratch, "queue");
  const toy: Workflow = { name: "toy", states: ["NEW"], waitingStates: [], initialState: "NEW", terminalStates: ["DONE"], plan: () => ({ kind: "settled", why: "" }) };
  const toyRuntime = (discovered: WorkflowRuntime["found"]): WorkflowRuntime => ({ policy: {}, found: discovered, newRecord: (id, t) => ({ id, state: "NEW", updatedAt: t.toISOString(), attempts: {}, history: [] }), observe: async () => ({}), actions: {}, apply: (r) => r });
  // The queue reads the same `fs` object this run holds, so a stand-in put
  // on it here is the one the queue calls.
  const patched: { renameSync: typeof fs.renameSync; writeFileSync: typeof fs.writeFileSync; readFileSync: typeof fs.readFileSync } = fs;
  const now = new Date("2026-09-03T12:00:00.000Z");
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);
  const drain = (queue: Queue) => { const out: string[] = []; for (let item = queue.claim(at(60)); item; item = queue.claim(at(60))) out.push(item.workId); return out; };

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
  const refreshed = new FileQueue(path.join(dir, "refreshed"), "priority");
  let found = [{ workId: "A", priority: 2 }, { workId: "B", priority: 3 }];
  const records = new Map<string, WorkRecord>();
  const worker = new Worker({
    queue: refreshed,
    records: { load: (id: string) => records.get(id) ?? null, save: (r: WorkRecord) => records.set(r.id, r), all: () => [...records.values()] },
    workflow: toy,
    runtime: toyRuntime(async () => found),
    notifier: { announce: async () => {} },
    now: () => now,
    config: { staleClaimMs: 60000, retentionDays: 7, maxItemAttempts: 3, retryDelayMs: 0 },
  });
  await worker.discover();
  found = [{ workId: "A", priority: 2 }, { workId: "B", priority: 1 }];
  await worker.discover();
  record("compose.a_priority_refreshed_on_discovery_reorders_the_queue", JSON.stringify(drain(refreshed)) === JSON.stringify(["B", "A"]));

  // The interleaving that once ran one look twice: a worker claims the item
  // at the instant a reprioritization is about to rewrite it.
  const raced = path.join(dir, "raced");
  const mine = new FileQueue(raced, "priority");
  const worker2 = new FileQueue(raced, "priority");
  mine.enqueue({ workId: "A", reason: "found", priority: 3 }, now);
  const { renameSync, writeFileSync } = fs;
  let stolen: string | undefined;
  const steal = () => { if (stolen === undefined) { stolen = ""; stolen = worker2.claim(at(60))?.workId ?? ""; } };
  patched.renameSync = (from, to) => { if (String(to).includes(".reprioritizing.")) steal(); return renameSync(from, to); };
  patched.writeFileSync = (file, ...rest) => { if (String(file).includes(`${path.sep}ready${path.sep}`) && String(file).endsWith(".json")) steal(); return writeFileSync(file, ...rest); };
  let changedRaced: number | undefined;
  try { changedRaced = mine.reprioritize("A", 1); } finally { patched.renameSync = renameSync; patched.writeFileSync = writeFileSync; }
  record("compose.reprioritizing_never_recreates_a_claimed_item", stolen === "A" && changedRaced === 0 && mine.pending().length === 0 && worker2.claim(at(60)) === null, { stolen, changedRaced, pending: mine.pending().length });

  // Review 2: a reprioritization that fails, or dies, puts the item back.
  const broken = path.join(dir, "broken");
  const holder = new FileQueue(broken, "priority");
  const heldItem = holder.enqueue({ workId: "H", reason: "found", priority: 3, delayMs: 60_000 }, now);
  const writeFile2 = fs.writeFileSync;
  patched.writeFileSync = (file, ...rest) => { if (String(file).endsWith(".next")) throw new Error("ENOSPC"); return writeFile2(file, ...rest); };
  let threw = false;
  try { holder.reprioritize("H", 1); } catch { threw = true; } finally { patched.writeFileSync = writeFile2; }
  const afterFailure = holder.pending().map((item) => `${item.workId}:${item.priority}`);
  const heldFile = path.join(broken, "ready", `${heldItem.id}.json`);
  fs.renameSync(heldFile, `${heldFile}.reprioritizing.${Date.now()}`);
  const claimableWhileHeld = holder.claim(at(120));
  holder.recover(60_000, new Date(Date.now() + 120_000));
  const afterDeath = holder.pending().map((item) => `${item.workId}:${item.priority}`);
  record("compose.an_interrupted_reprioritization_is_put_back", threw && afterFailure.join() === "H:3" && claimableWhileHeld === null && afterDeath.join() === "H:3", { threw, afterFailure, claimableWhileHeld, afterDeath });

  // Review 3: a hold's age is the hold's, not the item's; and discovery sees
  // what a dead reprioritization held.
  const aged = path.join(dir, "aged");
  const agedQueue = new FileQueue(aged, "priority");
  const agedItem = agedQueue.enqueue({ workId: "OLD", reason: "found", priority: 3 }, now);
  const agedFile = path.join(aged, "ready", `${agedItem.id}.json`);
  const hourAgo = new Date(Date.now() - 3_600_000);
  fs.utimesSync(agedFile, hourAgo, hourAgo);
  const recovery = new FileQueue(aged, "priority");
  let tookLive: QueueItem[] = [];
  const writeFile3 = fs.writeFileSync;
  patched.writeFileSync = (file, ...rest) => { if (String(file).endsWith(".next")) tookLive = recovery.recover(1_800_000, new Date()); return writeFile3(file, ...rest); };
  try { agedQueue.reprioritize("OLD", 1); } finally { patched.writeFileSync = writeFile3; }
  record("compose.recovery_never_takes_a_live_reprioritization", tookLive.length === 0 && agedQueue.pending().length === 1 && agedQueue.pending()[0]?.priority === 1, { tookLive: tookLive.length, pending: agedQueue.pending().length });

  const dead = path.join(dir, "dead");
  const deadQueue = new FileQueue(dead, "priority");
  const deadItem = deadQueue.enqueue({ workId: "D", reason: "found", priority: 3 }, now);
  const deadFile = path.join(dead, "ready", `${deadItem.id}.json`);
  fs.renameSync(deadFile, `${deadFile}.reprioritizing.${Date.now()}`);
  const engine = new Worker({
    queue: deadQueue,
    records: { load: () => null, save: () => {}, all: () => [] },
    workflow: toy,
    runtime: toyRuntime(async () => [{ workId: "D", priority: 3 }]),
    notifier: { announce: async () => {} },
    now: () => now,
    config: { staleClaimMs: 60000, retentionDays: 7, maxItemAttempts: 3, retryDelayMs: 0 },
  });
  const requeued = await engine.discover();
  deadQueue.recover(60_000, new Date(Date.now() + 120_000));
  record("compose.discovery_sees_work_a_reprioritization_holds", requeued.length === 0 && deadQueue.pending().filter((item) => item.workId === "D").length === 1, { requeued, pending: deadQueue.pending().length });

  // Review 4: an item between its two names is still pending, and recovery
  // survives a claim landing between its restore and a second read.
  const names = path.join(dir, "names");
  const namesQueue = new FileQueue(names, "priority");
  const namesItem = namesQueue.enqueue({ workId: "N", reason: "found", priority: 3 }, now);
  const namesFile = path.join(names, "ready", `${namesItem.id}.json`);
  const readFile = fs.readFileSync;
  let movedMidRead = false;
  // Overloaded, so the stand-in is told which: it hands every argument on unchanged.
  patched.readFileSync = ((target: fs.PathOrFileDescriptor, ...rest: [BufferEncoding]) => {
    if (!movedMidRead && String(target) === namesFile) { movedMidRead = true; renameSync(namesFile, `${namesFile}.reprioritizing.${Date.now()}`); }
    return readFile(target, ...rest);
  }) as typeof fs.readFileSync;
  let seenMidHold: string[] | undefined;
  try { seenMidHold = namesQueue.pending().map((item) => item.workId); } finally { patched.readFileSync = readFile; }
  record("compose.an_item_between_its_two_names_is_still_pending", movedMidRead && JSON.stringify(seenMidHold) === '["N"]', { movedMidRead, seenMidHold });

  const racing = path.join(dir, "racing");
  const racingQueue = new FileQueue(racing, "priority");
  const racingWorker = new FileQueue(racing, "priority");
  const racingItem = racingQueue.enqueue({ workId: "R", reason: "found", priority: 3 }, now);
  const racingFile = path.join(racing, "ready", `${racingItem.id}.json`);
  renameSync(racingFile, `${racingFile}.reprioritizing.${Date.now() - 3_600_000}`);
  let racedClaim: string | undefined;
  patched.renameSync = (from, to) => { const done = renameSync(from, to); if (racedClaim === undefined && String(to) === racingFile) { racedClaim = ""; racedClaim = racingWorker.claim(at(60))?.workId ?? ""; } return done; };
  let restoredRace: string[] | string;
  try { restoredRace = racingQueue.recover(1_800_000, new Date()).map((item) => item.workId); } catch (error) { restoredRace = String(error); } finally { patched.renameSync = renameSync; }
  record("compose.recovery_survives_a_claim_racing_its_restore", racedClaim === "R" && JSON.stringify(restoredRace) === '["R"]', { racedClaim, restoredRace });

  // Review 5: a replacement that fails half-written leaves only the original.
  const partial = path.join(dir, "partial");
  const partialQueue = new FileQueue(partial, "priority");
  partialQueue.enqueue({ workId: "P", reason: "found", priority: 3 }, now);
  patched.writeFileSync = (file, ...rest) => {
    if (String(file).endsWith(".next")) { writeFileSync(file, "{ half"); throw new Error("ENOSPC"); }
    return writeFileSync(file, ...rest);
  };
  try { partialQueue.reprioritize("P", 1); } catch { /* the disk filled */ } finally { patched.writeFileSync = writeFileSync; }
  const leftovers = fs.readdirSync(path.join(partial, "ready")).filter((name) => !name.endsWith(".json"));
  record("compose.a_half_written_replacement_leaves_nothing_behind", leftovers.length === 0 && partialQueue.pending().map((item) => `${item.workId}:${item.priority}`).join() === "P:3", { leftovers });

  // Review 6: a claim returns the item as it arrived in running/, so a
  // refresh that finished in between is not undone by the next look.
  const claimRace = path.join(dir, "claim-race");
  const claimer = new FileQueue(claimRace, "priority");
  const refresher = new FileQueue(claimRace, "priority");
  claimer.enqueue({ workId: "C", reason: "found", priority: 3 }, now);
  let refreshedMidClaim = false;
  patched.renameSync = (from, to) => {
    if (!refreshedMidClaim && String(to).includes(`${path.sep}running${path.sep}`)) { refreshedMidClaim = true; refresher.reprioritize("C", 1); }
    return renameSync(from, to);
  };
  let claimedItem: QueueItem | null | undefined;
  try { claimedItem = claimer.claim(at(60)); } finally { patched.renameSync = renameSync; }
  record("compose.a_claim_carries_the_priority_it_arrived_with", refreshedMidClaim && claimedItem?.priority === 1, { refreshedMidClaim, priority: claimedItem?.priority });

  const plain = new FileQueue(path.join(dir, "plain"));
  plain.enqueue({ workId: "LOW", reason: "found", priority: 4 }, now);
  plain.enqueue({ workId: "URGENT", reason: "found", priority: 1 }, at(1));
  record("compose.without_the_option_the_queue_keeps_id_order", JSON.stringify(drain(plain)) === JSON.stringify(["LOW", "URGENT"]));
}

/* The thread half of a hand-over, and the declaration, from the built workflow. */
{
  const posted: string[] = [];
  const announced: string[] = [];
  const runtime = ticketToQa.ticketRuntime({
    tracker: standIn(), host: standIn(), agent: standIn(), gate: standIn(), roster: () => standIn<Roster>(), git: standIn(), now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" },
    config: { repos: [REPO], qaStatusName: "In QA" },
    policy: { ...ticketToQa.DEFAULT_POLICY, writes: "operator" },
    notifier: { announce: async (a) => void announced.push(a.text) },
    conversation: standIn<Conversation>({ open: async () => ({ id: "T1" }), post: async (_t, m) => (posted.push(m.text), "m"), replies: async () => [] }),
  });
  const handOver = runtime.actions["hand-over"];
  if (typeof handOver !== "function") throw new Error("the built runtime has no hand-over to run");
  await handOver(
    { type: "hand-over", turns: [{ key: "open-pull-request@x", write: { type: "open-pull-request" } }] },
    { record: standIn<TicketRecord>({ id: TICKET, state: "PR_OPEN" }), observation: standIn<Observation>({ ticket: { id: TICKET, title: "t", repo: REPO, branchName: BRANCH, url: "u", labels: [], status: "In Progress" }, pullRequest: null }), outcomes: {} },
  );
  record("compose.a_handed_off_write_is_said_in_the_works_thread", posted.length === 1 && posted[0]?.includes("Open a pull request") === true && announced.length === 0, posted);

  const claims: Workflow<never, never>[] = [];
  void drawnTicketToQa.register(standIn<Registry>({ workflow: (w) => claims.push(w), contribute: () => {} }), standIn<PluginContext>({ config: { policy: { writes: "operator" } } }));
  record("compose.handed_off_the_declaration_claims_no_writes", claims[0]?.trackerWrites?.length === 0 && claims[0].codeHostWrites?.length === 0 && !Object.keys(runtime.actions).some((name) => ["ask-question", "escalate", "open-pull-request", "resolve-review-thread", "assign-reviewer", "request-rereview", "hand-off-to-qa"].includes(name)));
}

/* The decisions a review found wrong, asked of the built machine. */
{
  const { plan, DEFAULT_POLICY } = ticketToQa;
  const newRecord = drawnTicketToQa.newRecord;
  const operator = { ...DEFAULT_POLICY, writes: "operator" as const };
  const roster: Roster = { confirmedOn: new Date().toISOString().slice(0, 10), reviewers: [{ tracker: "ada@example.test", host: "ada", available: true }], qa: { tracker: "grace@example.test", host: "grace", available: true } };
  const head = "a".repeat(40);
  const pr = (extra: Partial<PullRequestView>): PullRequestView => ({ number: 1, url: "u", headSha: head, isDraft: false, changedFiles: 1, additions: 1, deletions: 0, reviewDecision: "CHANGES_REQUESTED", checks: null, mergeState: "mergeable", merged: false, base: "main", reviews: [], threads: [], requestedReviewers: [], ...extra });
  const obs = (extra: Partial<Observation>): Observation => ({ ticket: { id: TICKET, title: "t", url: "u", status: "In Progress", labels: [], repo: REPO, branchName: BRANCH }, pullRequest: null, reviewLoad: {}, roster, conversation: [], escalationAnswered: false, now: new Date(), ...extra });
  const rec = (state: TicketRecord["state"], extra?: Partial<TicketRecord>): TicketRecord => ({ ...newRecord(TICKET, new Date()), state, ...extra });

  const key = "request-review@ada@round0";
  const asked = rec("RE_REVIEW", { reviewer: "ada", handedOver: [key], handedOverAt: { [key]: "2026-09-03T12:00:00.000Z" } });
  const stale = plan(asked, obs({ pullRequest: pr({ reviews: [{ author: "ada", state: "CHANGES_REQUESTED", commitSha: head, submittedAt: "2026-09-03T11:00:00.000Z" }] }) }), operator);
  const fresh = plan(asked, obs({ pullRequest: pr({ reviews: [{ author: "ada", state: "APPROVED", commitSha: head, submittedAt: "2026-09-03T12:30:00.000Z" }] }) }), operator);
  // Review 7: a second round on the same head is a second turn.
  const toReReview = (at: string) => ({ at, from: "HUMAN_FIX", to: "RE_REVIEW", why: "every comment was addressed" });
  const roundOne = ["request-review@ada@round1", `request-review@ada@${head}`];
  const secondRound = plan(
    rec("RE_REVIEW", { reviewer: "ada", history: [toReReview("2026-09-03T11:30:00.000Z"), toReReview("2026-09-03T13:30:00.000Z")], handedOver: roundOne, handedOverAt: Object.fromEntries(roundOne.map((k) => [k, "2026-09-03T12:00:00.000Z"])) }),
    obs({ pullRequest: pr({ reviews: [
      { author: "ada", state: "CHANGES_REQUESTED", commitSha: head, submittedAt: "2026-09-03T11:00:00.000Z" },
      { author: "ada", state: "CHANGES_REQUESTED", commitSha: head, submittedAt: "2026-09-03T13:00:00.000Z" },
    ] }) }),
    operator,
  );
  record("compose.a_second_review_round_on_one_head_is_said_again", firstTurn(secondRound) === "request-review@ada@round2", { kind: secondRound.kind, to: toOf(secondRound) });
  record("compose.a_re_review_is_answered_only_after_it_was_asked", stale.kind === "wait" && fresh.kind === "advance" && fresh.to === "HUMAN_REVIEW", { stale: stale.kind, fresh: fresh.kind });

  const merged = [OTHER_REPO, REPO].map((repo) => ({ repo, merged: true }));
  const follower = plan(rec("QA_HANDOFF"), obs({ repositories: merged }), DEFAULT_POLICY);
  const handed = plan(rec("QA_HANDOFF"), obs({ repositories: merged, inQa: true, ticket: { ...obs({}).ticket, status: "In QA", assignee: "grace@example.test" } }), DEFAULT_POLICY);
  record("compose.a_follower_waits_until_it_sees_the_handoff", follower.kind === "wait" && handed.kind === "advance" && handed.to === "DONE" && handed.effects.length === 0, { follower: follower.kind, handed: handed.kind });

  // Review 2: a requested review never carries a broken branch past the
  // checks; logins and instants are compared as the forge means them; the
  // handoff answers to the owner it named; a repository that leaves the
  // ticket retires its work item.
  const rkey = "request-review@ada";
  const requested = (extra: Partial<PullRequestView>, at = "2026-09-03T12:00:00.000Z") =>
    plan(rec("REVIEWER_ASSIGNED", { reviewer: "ada", handedOver: [rkey], handedOverAt: { [rkey]: at } }), obs({ pullRequest: pr({ reviewDecision: "REVIEW_REQUIRED", ...extra }) }), operator);
  const red = requested({ requestedReviewers: ["ada"], checks: { state: "failing", commitSha: head } });
  const conflicting = requested({ requestedReviewers: ["ada"], mergeState: "conflicting" });
  record("compose.a_requested_review_still_answers_to_the_forges_checks", toOf(red) === "ESCALATED" && toOf(conflicting) === "ESCALATED", { red: toOf(red) ?? red.kind, conflicting: toOf(conflicting) ?? conflicting.kind });
  const cased = requested({ requestedReviewers: ["Ada"] });
  const early = requested({ reviews: [{ author: "ada", state: "APPROVED", commitSha: head, submittedAt: "2026-09-03T12:00:00Z" }] }, "2026-09-03T12:00:00.900Z");
  record("compose.a_review_request_matches_logins_and_instants_as_the_forge_writes_them", toOf(cased) === "HUMAN_REVIEW" && early.kind === "wait", { cased: toOf(cased) ?? cased.kind, early: early.kind });
  const moved = { ...roster, qa: { tracker: "ada@example.test", host: "ada", available: true } };
  const reSaid = plan(rec("QA_HANDOFF", { handedOver: ["hand-off-to-qa@grace@example.test"] }), obs({ roster: moved }), operator);
  const named = plan(rec("QA_HANDOFF", { handedOver: ["hand-off-to-qa@grace@example.test"] }), obs({ inQa: true, ticket: { ...obs({}).ticket, status: "In QA", assignee: "grace@example.test" } }), operator);
  record("compose.a_qa_handoff_answers_to_the_owner_it_named", firstTurn(reSaid) === "hand-off-to-qa@ada@example.test" && toOf(named) === "DONE", { reSaid: firstTurn(reSaid), named: toOf(named) ?? named.kind });
  const relabelled = await ticketToQa.ticketRuntime({
    tracker: standIn<Tracker>({ get: async () => ({ ...obs({}).ticket, repo: REPO, repos: [OTHER_REPO] }) }),
    host: standIn<CodeHost>({ findPullRequest: async () => null, findPullRequestMentioning: async () => null }), agent: standIn(), gate: standIn(), notifier: { announce: async () => {} }, roster: () => roster, git: standIn(), now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" }, config: { repos: [REPO], qaStatusName: "In QA" }, policy: DEFAULT_POLICY,
  }).observe(rec("HUMAN_REVIEW"));
  const retired = plan(rec("HUMAN_REVIEW"), relabelled, DEFAULT_POLICY);
  // Settled where it stands, not DONE: review 4 found DONE could never resume.
  record("compose.a_repository_that_leaves_the_ticket_retires_its_work_item", relabelled.retired === true && retired.kind === "settled", { retired: relabelled.retired, kind: retired.kind });

  const unlabelled = await ticketToQa.ticketRuntime({
    tracker: standIn<Tracker>({ get: async () => ({ ...obs({}).ticket, repo: REPO }) }),
    host: standIn<CodeHost>({ findPullRequest: async () => null, findPullRequestMentioning: async () => null }), agent: standIn(), gate: standIn(), notifier: { announce: async () => {} }, roster: () => roster, git: standIn(), now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" }, config: { repos: [REPO], qaStatusName: "In QA" }, policy: DEFAULT_POLICY,
  }).observe({ ...rec("IMPLEMENTING"), id: ticketToQa.workIdFor(TICKET, OTHER_REPO) });
  record("compose.a_repository_whose_last_label_went_retires_its_work_item", unlabelled.retired === true && unlabelled.ticket.repo === OTHER_REPO, { retired: unlabelled.retired });

  const observeAs = (repos: string[]) => ticketToQa.ticketRuntime({
    tracker: standIn<Tracker>({ get: async () => ({ ...obs({}).ticket, repo: REPO, repos }) }),
    host: standIn<CodeHost>({ findPullRequest: async () => null, findPullRequestMentioning: async () => null }), agent: standIn(), gate: standIn(), notifier: { announce: async () => {} }, roster: () => roster, git: standIn(), now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" }, config: { repos: [REPO], qaStatusName: "In QA" }, policy: DEFAULT_POLICY,
  }).observe(rec("HUMAN_FIX", { reviewer: "ada" }));
  const stopped = plan(rec("HUMAN_FIX", { reviewer: "ada" }), await observeAs([OTHER_REPO]), DEFAULT_POLICY);
  const resumed = plan(rec("HUMAN_FIX", { reviewer: "ada" }), await observeAs([OTHER_REPO, REPO]), DEFAULT_POLICY);
  record("compose.a_retired_work_item_resumes_when_its_repository_returns", stopped.kind === "settled" && resumed.kind !== "settled" && !drawnTicketToQa.workflow.terminalStates.includes("HUMAN_FIX"), { stopped: stopped.kind, resumed: resumed.kind });

  const refused = await ticketToQa.ticketRuntime({
    tracker: standIn<Tracker>({ inProgress: async () => [{ ...obs({}).ticket, repos: [REPO, OTHER_REPO] }] }),
    host: standIn<CodeHost>({ findPullRequest: async () => null }), agent: standIn(), gate: standIn(), notifier: { announce: async () => {} }, roster: () => roster, git: standIn(), now: () => new Date(),
    layout: { workspaceRoot: scratch, defaultBranch: "main" }, config: { repos: [REPO], qaStatusName: "In QA" }, policy: DEFAULT_POLICY,
  }).found().then(() => "found", (error: unknown) => String(error));
  record("compose.a_host_that_cannot_read_merges_is_refused_by_name", refused.includes(TICKET) && refused.includes("cannot find a pull request by a ticket's id"), refused);
}

/* 4. The installed machine, handing its writes to the operator. ----------- */
const lifecycle = installed();
record("compose.handed_off_nothing_is_written_on_the_tracker", lifecycle.trackerWrites.length === 0, lifecycle.trackerWrites);
record("compose.handed_off_nothing_is_written_on_the_code_host", lifecycle.ghWrites.length === 0, lifecycle.ghWrites);
record("compose.handed_off_the_ticket_still_reaches_qa", lifecycle.states.every((s) => s === "DONE") && lifecycle.ticketStatus === "In QA", { states: lifecycle.states, status: lifecycle.ticketStatus });
record("compose.a_handed_off_write_is_said_once", lifecycle.saidTwice.length === 0 && lifecycle.said.length > 0, { said: lifecycle.said, twice: lifecycle.saidTwice });
record("compose.with_no_thread_a_handed_off_write_goes_to_the_notifier", lifecycle.said.some((s) => s.includes("Open a pull request")) && lifecycle.said.some((s) => s.includes("Move ")));
record("compose.nothing_moves_until_the_handed_off_effect_is_observed", lifecycle.premature.length === 0 && lifecycle.made.length >= 5, { made: lifecycle.made, premature: lifecycle.premature });
record("compose.a_ticket_in_two_repositories_is_two_work_items", lifecycle.ids.length === 2 && lifecycle.ids.every((id) => id.startsWith(TICKET)), lifecycle.ids);
record("compose.labelling_a_running_ticket_keeps_its_work_item", JSON.stringify(lifecycle.ids.sort()) === JSON.stringify([TICKET, `${TICKET}@${OTHER_REPO}`].sort()), lifecycle.ids);
record("compose.review_fixes_land_on_the_pull_requests_own_branch", lifecycle.fixOnOwnBranch && !lifecycle.fixOnTicketBranch, { own: lifecycle.fixOnOwnBranch, ticketBranch: lifecycle.fixOnTicketBranch });
record("compose.the_operator_answers_on_the_ticket_with_their_own_account", lifecycle.answeredAsSelf >= 2 && lifecycle.states.every((s) => s === "DONE"), { answered: lifecycle.answeredAsSelf, states: lifecycle.states });
record("compose.qa_is_done_only_when_status_and_owner_are_both_seen", lifecycle.heldForOwner >= 1 && lifecycle.ticketAssignee === "u-grace", { held: lifecycle.heldForOwner, assignee: lifecycle.ticketAssignee });
record("compose.each_repository_walks_in_its_own_tree", lifecycle.ownTrees, lifecycle.trees);
record("compose.qa_waits_while_one_repository_is_unmerged", lifecycle.heldForMerge >= 2, lifecycle.heldForMerge);
record("compose.qa_receives_the_ticket_once_when_every_repository_is_merged", lifecycle.qaTurns === 1 && lifecycle.qaBeforeEveryMerge === false, { qaTurns: lifecycle.qaTurns });
record("compose.a_repository_added_late_is_a_new_work_item_qa_waits_for", lifecycle.lateDiscovered && lifecycle.waitedForLate, { late: lifecycle.lateDiscovered, waited: lifecycle.waitedForLate });

interface Lifecycle {
  said: string[];
  saidTwice: string[];
  made: string[];
  premature: string[];
  heldForMerge: number;
  qaTurns: number;
  qaBeforeEveryMerge: boolean;
  lateDiscovered: boolean;
  waitedForLate: boolean;
  heldForOwner: number;
  answeredAsSelf: number;
  ids: string[];
  states: (string | undefined)[];
  ticketStatus: string;
  ticketAssignee: string;
  fixOnOwnBranch: boolean;
  fixOnTicketBranch: boolean;
  trackerWrites: string[];
  ghWrites: string[];
  trees: { repo: string; head: string }[];
  ownTrees: boolean;
}

/** One turn the machine said, as the operator read it off the inbox. */
interface Turn {
  workId: string;
  state: string | undefined;
  said: string;
}

function installed(): Lifecycle {
  const root = path.join(scratch, "installed");
  fs.mkdirSync(root, { recursive: true });
  build(root, { source: world });
  const tracker = startTracker(root);
  const home = path.join(root, "home");
  const amy = (...args: string[]) => {
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
  const idFor = (r: string) => (r === REPO ? TICKET : ticketToQa.workIdFor(TICKET, r));
  const OPS_BRANCH = "ops/bill-4021-opened-by-hand";
  const pullOf = (state: Hosted, repoName: string) => state.repos[repoName]?.pulls.find((p) => (p.title ?? "").startsWith(TICKET));
  const recordOf = (id: string) => { const file = path.join(recordsDir, `${id}.json`); return fs.existsSync(file) ? read<TicketRecord>(file) : null; };
  const ticketIn = (state: TrackerState) => existing(state.issues[0], TICKET);

  try {
    amy("init");
    configure(root, tracker.endpoint);
    operatorConfig(root, tracker.endpoint);
    installPlugins(root);
    // The roster is the workflow's own file now: an operator who renamed the
    // workflow's profile into their config rather than adding the package
    // edits it by hand, exactly what editRoster types, and `roster confirm`
    // is what stamps it once it is there.
    editRoster(root);
    amy("roster", "confirm");

    // Only the widgets half is known at first, and nobody else's reviews
    // sit on the pile, so the walk is about the handover and the join.
    const t = read<TrackerState>(trackerFile);
    t.issues = t.issues.filter((issue) => issue.identifier === TICKET);
    // Team-only at first: the work starts before anybody labels a
    // repository, which is the shape that once doubled it.
    ticketIn(t).labels = ["Bug"];
    write(trackerFile, t);
    const h = read<Hosted>(hostFile);
    for (const entry of Object.values(h.repos)) entry.pulls = [];
    write(hostFile, h);

    const out: Lifecycle = {
      said: [], saidTwice: [], made: [], premature: [], heldForMerge: 0, qaTurns: 0, qaBeforeEveryMerge: false, lateDiscovered: false, waitedForLate: false, heldForOwner: 0, answeredAsSelf: 0,
      // Read once the walk is over.
      ids: [], states: [], ticketStatus: "", ticketAssignee: "", fixOnOwnBranch: false, fixOnTicketBranch: false, trackerWrites: [], ghWrites: [], trees: [], ownTrees: false,
    };
    let ownerPending = false;
    const seen = new Set<string>();
    const heard = new Set<string>();
    const pending: Turn[] = [];
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
      for (const file of fs.existsSync(inbox) ? fs.readdirSync(inbox).sort() : []) hear(file);

      if (stalled < 2) continue;
      stalled = 0;
      react(ids);
    }

    return outcome();

    function hear(file: string) {
      if (heard.has(file)) return;
      heard.add(file);
      const text = fs.readFileSync(path.join(inbox, file), "utf-8");
      const said = text.split("\n").slice(5, -3).join("\n").trim();
      const workId = (text.split("\n")[0] ?? "").replace(/^# /, "");
      const state = /^State: (\S+)/m.exec(text)?.[1];
      out.said.push(said);
      const key = `${workId}|${said}`;
      if (seen.has(key)) out.saidTwice.push(said);
      seen.add(key);
      if (said.startsWith("Move ")) {
        out.qaTurns += 1;
        const pulls = read<Hosted>(hostFile);
        out.qaBeforeEveryMerge ||= Object.values(pulls.repos).some((entry) => entry.pulls.some((p) => p.state === "open"));
      }
      pending.push({ workId, state, said });
    }

    /** What the walk left behind, read once it is over. */
    function outcome(): Lifecycle {
      const finalIds = fs.readdirSync(recordsDir).map((f) => f.replace(/\.json$/, ""));
      out.ids = finalIds.map((f) => decodeURIComponent(f));
      out.states = finalIds.map((id) => recordOf(id)?.state);
      out.ticketStatus = ticketIn(read(trackerFile)).stateId === "s-qa" ? "In QA" : ticketIn(read(trackerFile)).stateId;
      out.ticketAssignee = ticketIn(read(trackerFile)).assigneeId;
      // A run that never got as far as the branch is a finding, not a crash.
      const subjects = (branch: string) => { try { return git(root, "--git-dir", path.join(root, "origins", "widgets.git"), "log", "--format=%s", branch).split("\n"); } catch { return []; } };
      out.fixOnOwnBranch = subjects(OPS_BRANCH).some((s) => s.includes("address review comments"));
      out.fixOnTicketBranch = subjects(BRANCH).some((s) => s.includes("address review comments"));
      out.trackerWrites = lines<{ query?: string; operation: string }>(path.join(root, "world", "tracker.log")).filter((l) => /mutation/i.test(l.query ?? "")).map((l) => l.operation);
      out.ghWrites = lines<{ argv: string[] }>(path.join(root, "world", "gh.log")).map((l) => l.argv.join(" ")).filter((argv) => /--method (POST|PUT|PATCH|DELETE)|mutation /.test(argv));
      out.trees = [REPO, OTHER_REPO].map((r) => ({ repo: r, head: headOf(root, r.slice(r.indexOf("/") + 1), BRANCH) }));
      const files = (origin: string) => { try { return git(root, "--git-dir", path.join(root, "origins", origin), "ls-tree", "--name-only", BRANCH); } catch { return ""; } };
      out.ownTrees = out.trees.every((tree) => tree.head) && out.trees[0]?.head !== out.trees[1]?.head &&
        files("widgets.git").includes("invoice.md") && files("gadgets.git").includes("credit-note.md");
      out.lateDiscovered &&= Boolean(recordOf(idFor(OTHER_REPO)));
      return out;
    }

    /** The operator and the reviewers, when the machine has stopped moving. */
    function react(ids: string[]) {
      // The operator carries out what they were told, in the order they were told it.
      for (const turn of pending.splice(0)) carryOut(turn);

      // The owner is assigned one look after the status moved, and the
      // machine must still be holding when it is.
      if (ownerPending) assignOwner();

      const hostState = read<Hosted>(hostFile);
      for (const id of ids) {
        const rec = recordOf(id);
        const repoName = id.includes("@") ? decodeURIComponent(id.slice(id.indexOf("@") + 1)) : REPO;
        const pull = pullOf(hostState, repoName);
        if (!pull || !rec) continue;
        const head = headOf(root, repoName.slice(repoName.indexOf("/") + 1), pull.head);
        if (rec.state === "COPILOT_WAIT") botReviews(pull, head, repoName);
        if (rec.state === "HUMAN_REVIEW") reviewerApproves(rec, pull, head);
        if (rec.state === "QA_HANDOFF") mergeOrHold(hostState, pull, repoName);
      }
      write(hostFile, hostState);

      grow();
    }

    function carryOut(turn: Turn) {
      const current = recordOf(turn.workId)?.state;
      const made = operate(turn);
      if (!made) return;
      out.made.push(`${turn.workId} ${current}: ${made}`);
      // A turn made while the machine was already past where it said it
      // would wait is a machine that did not wait for it.
      // A question or an escalation is said on the move into the state
      // that waits for its answer, so only the other turns are held to it.
      const movesOnItsOwn = /needs an answer|needs your call/.test(turn.said);
      if (current !== turn.state && !movesOnItsOwn) out.premature.push(`${turn.workId}: said in ${turn.state}, already ${current}`);
    }

    function assignOwner() {
      const leader = recordOf(TICKET);
      if (leader && leader.state !== "DONE") out.heldForOwner += 1;
      const t5 = read<TrackerState>(trackerFile);
      ticketIn(t5).assigneeId = "u-grace";
      write(trackerFile, t5);
      ownerPending = false;
    }

    function botReviews(pull: Pull, head: string, repoName: string) {
      if (pull.reviews.some((r) => r.author === BOT && r.commitSha === head)) return;
      const first = pull.reviews.every((r) => r.author !== BOT);
      pull.reviews.push({ author: BOT, state: "COMMENTED", commitSha: head, submittedAt: new Date().toISOString() });
      if (first && repoName === REPO) pull.threads.push({ id: "BOT-1", author: BOT, body: "This file has no trailing newline.", isResolved: false, isOutdated: false, path: "invoice.md" });
    }

    function reviewerApproves(rec: TicketRecord, pull: Pull, head: string) {
      const reviewer = rec.reviewer;
      if (!reviewer || !pull.requestedReviewers.includes(reviewer)) return;
      pull.reviewDecision = "APPROVED";
      pull.requestedReviewers = pull.requestedReviewers.filter((w) => w !== reviewer);
      pull.reviews.push({ author: reviewer, state: "APPROVED", commitSha: head, submittedAt: new Date().toISOString() });
    }

    function mergeOrHold(hostState: Hosted, pull: Pull, repoName: string) {
      // Widgets merges as soon as it is waiting; gadgets only after the
      // widgets item has been seen holding for it, so the join must wait.
      if (pull.state === "open" && (repoName === REPO || out.heldForMerge >= 2)) {
        pull.state = "merged";
        pull.merged = true;
      }
      const late = pullOf(hostState, OTHER_REPO);
      if (repoName === REPO && pull.merged && !late?.merged) out.heldForMerge += 1;
    }

    function grow() {
      // The ticket grows a second repository once the first is under way.
      const first = recordOf(idFor(REPO));
      if (!out.lateDiscovered && first && ["COPILOT_WAIT", "REVIEWER_ASSIGNED", "HUMAN_REVIEW", "APPROVED", "QA_HANDOFF"].includes(first.state)) {
        const t2 = read<TrackerState>(trackerFile);
        (ticketIn(t2).labels ??= []).push("widgets", "gadgets");
        write(trackerFile, t2);
        amy("discover");
        out.lateDiscovered = true;
      }
      if (first?.state === "QA_HANDOFF") {
        const late = recordOf(idFor(OTHER_REPO));
        if (late && late.state !== "DONE") out.waitedForLate = true;
      }
    }

    function operate({ workId, said }: Turn) {
      const repoName = workId.includes("@") ? decodeURIComponent(workId.slice(workId.indexOf("@") + 1)) : REPO;
      if (said.includes("needs an answer")) {
        const t3 = read<TrackerState>(trackerFile);
        // The operator answers with their own account — the one amy reads
        // the tracker as — because with the writes handed over, nobody
        // else's key is involved.
        ticketIn(t3).comments.push({ body: "In BRL, the same as the rest of the invoice.", createdAt: new Date().toISOString(), userId: t3.viewer.id });
        out.answeredAsSelf += 1;
        write(trackerFile, t3);
        return "answered on the ticket";
      }
      const hostState = read<Hosted>(hostFile);
      const pulls = existing(hostState.repos[repoName], repoName).pulls;
      if (said.startsWith("Open a pull request")) {
        const title = existing(/titled "([^"]+)"/.exec(said)?.[1], "title in what was said");
        // In widgets the operator opens it from a branch of their own
        // naming, which only its title ties back to the ticket.
        let head = BRANCH;
        if (repoName === REPO) {
          git(root, "--git-dir", path.join(root, "origins", "widgets.git"), "branch", OPS_BRANCH, BRANCH);
          head = OPS_BRANCH;
        }
        pulls.push({ number: hostState.nextNumber++, title, head, base: "main", state: "open", isDraft: false, reviewDecision: "REVIEW_REQUIRED", changedFiles: 1, additions: 3, deletions: 0, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: "SUCCESS", requestedReviewers: [], reviews: [], threads: [], author: "amy" });
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
        const who = existing(review[1] ?? review[2], "reviewer in what was said");
        for (const pull of pulls.filter((p) => (p.title ?? "").startsWith(TICKET))) if (!pull.requestedReviewers.includes(who)) pull.requestedReviewers.push(who);
        write(hostFile, hostState);
        return `requested a review from ${who}`;
      }
      if (said.startsWith("Move ")) {
        const t4 = read<TrackerState>(trackerFile);
        ticketIn(t4).stateId = "s-qa";
        write(trackerFile, t4);
        ownerPending = true;
        return "moved the ticket to QA, and will assign the owner next";
      }
      return null;
    }
  } finally {
    tracker.child.kill();
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
    else console.log(`kept the world in ${root}`);
  }
}


function startTracker(root: string): { child: ChildProcess; endpoint: string } {
  const stateFile = path.join(root, "world", "tracker.json");
  const portFile = path.join(root, "world", "tracker.port");
  const child = spawn(process.execPath, [...process.execArgv, path.join(world, "tracker.ts"), stateFile, portFile], { stdio: "ignore" });
  if (process.env.AMY_E2E_PIDFILE) fs.appendFileSync(process.env.AMY_E2E_PIDFILE, `${child.pid}\n`);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(portFile)) {
    if (Date.now() > deadline) throw new Error("the stand-in tracker never listened");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  return { child, endpoint: `http://127.0.0.1:${fs.readFileSync(portFile, "utf-8").trim()}/graphql` };
}

/** The world's config, with the writes handed to the operator and a label per repository. */
function operatorConfig(root: string, endpoint: string) {
  const file = path.join(root, "home", ".amy", "config.yaml");
  let text = fs.readFileSync(file, "utf-8");
  text = text.replace("  rosterBackoffMs: 0\n", "  rosterBackoffMs: 0\n  writes: operator\n");
  text = text.replace(`    defaultRepo: ${REPO}\n`, `    defaultRepo: ${REPO}\n    repoByLabel:\n      widgets: ${REPO}\n      gadgets: ${OTHER_REPO}\n`);
  if (!text.includes("writes: operator") || !text.includes("repoByLabel")) throw new Error("the world's config moved; the operator edit no longer applies");
  void endpoint;
  fs.writeFileSync(file, text, "utf-8");
}

function installPlugins(root: string) {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
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
