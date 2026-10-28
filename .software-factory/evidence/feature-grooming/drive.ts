import type { BriefRecord, BriefStore, GroomedWork, GroomingTracker, HistoryResult, SearchResult } from "@amykit/core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repo = "", report = ""] = process.argv.slice(2);
if (repo === "" || report === "") {
  console.error("usage: drive.ts <repo> <report-path>");
  process.exit(2);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-grooming-"));
const run = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const workBy = (items: GroomedWork[], id: string): GroomedWork => { const item = items.find((i) => i.id === id); if (item === undefined) throw new Error(`no groomed work ${id}`); return item; };
try {
  const remote = path.join(root, "remote.git");
  const checkout = path.join(root, "checkout");
  run(root, "init", "--bare", "--initial-branch=main", remote);
  run(root, "clone", remote, checkout);
  run(checkout, "config", "user.email", "e2e@example.test"); run(checkout, "config", "user.name", "E2E");
  fs.writeFileSync(path.join(checkout, "schema.sql"), "create table items (id text);\n");
  run(checkout, "add", "."); run(checkout, "commit", "-m", "base"); run(checkout, "branch", "-M", "main"); run(checkout, "push", "-u", "origin", "main");
  const author = path.join(root, "author");
  run(root, "clone", remote, author);
  run(author, "config", "user.email", "someone@example.test"); run(author, "config", "user.name", "Somebody Else");
  run(checkout, "checkout", "-b", "private-work");
  fs.writeFileSync(path.join(checkout, "schema.sql"), "private column only\n");
  fs.writeFileSync(path.join(checkout, "private.txt"), "private_marker\n");
  // A checkout whose fetch refspec maps nothing: only a fetch that names its destination moves origin/main.
  run(checkout, "config", "remote.origin.fetch", "+refs/heads/elsewhere:refs/remotes/origin/elsewhere");
  const standingBefore = run(checkout, "branch", "--show-current");
  const statusBefore = run(checkout, "status", "--porcelain");
  const worktreesBefore = run(checkout, "worktree", "list").split("\n").length;
  // Somebody else ships the column after this machine last fetched.
  fs.writeFileSync(path.join(author, "schema.sql"), "create table items (id text, owner text);\n");
  run(author, "commit", "-am", "add the owner column"); run(author, "push", "origin", "main");
  const added = run(author, "rev-parse", "HEAD");
  const staleBefore = run(checkout, "rev-parse", "refs/remotes/origin/main");
  const { GitBaseSource }: typeof import("@amykit/core") = await import(pathToFileURL(path.join(repo, "packages/core/dist/index.js")).href);
  const { groomFeature }: typeof import("@amykit/workflow-feature-grooming") = await import(pathToFileURL(path.join(repo, "packages/workflow-feature-grooming/dist/index.js")).href);
  const source = new GitBaseSource({ run: async (command, args, options) => { try { return { ok: true, exitCode: 0, stdout: execFileSync(command, args, { cwd: options?.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(), stderr: "" }; } catch (error) { const failed = error as { status?: number | null; stdout?: string; stderr?: string }; return { ok: false, exitCode: failed.status ?? 1, stdout: String(failed.stdout ?? "").trim(), stderr: String(failed.stderr ?? error).trim() }; } } }, { workspaceRoot: root, checkouts: { "acme/widgets": checkout }, defaultBranch: "main" });
  const pinned = await source.snapshot("acme/widgets");
  const seen = (await pinned.read("schema.sql")) ?? "";
  const fetchedTo = run(checkout, "rev-parse", "refs/remotes/origin/main");
  const answersBefore = JSON.stringify([await pinned.read("schema.sql"), await pinned.search("owner text"), await pinned.history("owner text")]);
  // Then somebody drops it again, and something else on this machine fetches while the snapshot is in use.
  fs.writeFileSync(path.join(author, "schema.sql"), "create table items (id text);\n");
  run(author, "commit", "-am", "drop the owner column"); run(author, "push", "origin", "main");
  const dropped = run(author, "rev-parse", "HEAD");
  run(checkout, "fetch", "origin", "+refs/heads/main:refs/remotes/origin/main");
  const answersAfter = JSON.stringify([await pinned.read("schema.sql"), await pinned.search("owner text"), await pinned.history("owner text")]);
  const privateSearch = await pinned.search("private_marker");
  const columnSearch = await pinned.search("owner text");
  // The exit condition, through the workflow: a groomer asks whether the column exists and which commit made it.
  let groomed: { revision: string; committedAt: string; found: SearchResult; history: HistoryResult } | undefined;
  await groomFeature({ id: "F-2", title: "owner column", repos: ["acme/widgets"] }, { source: { snapshot: async () => pinned }, tracker: { features: async () => [], getFeature: async () => null, groomedWork: async () => [], createGroomedWork: async (x) => ({ ...x, id: "W-1", retired: false }), updateGroomedWork: async (id, x) => ({ id, featureId: "F-2", groomedBy: "", retired: false, ...x }), retireGroomedWork: async () => {} }, briefs: { get: async () => null, write: async (input) => ({ ...input, questions: [], createdAt: input.at, updatedAt: input.at, revision: 1 }), appendQuestion: async () => { throw new Error("unused"); }, retired: async () => [], remove: async () => {} }, now: () => new Date("2026-09-17T12:00:00.000Z"), groomer: { propose: async (_feature, [snapshot]) => {
    if (snapshot === undefined) throw new Error("no snapshot");
    const found = await snapshot.search("owner text");
    const history = await snapshot.history("owner text");
    groomed = { revision: snapshot.revision, committedAt: snapshot.committedAt, found, history };
    return found.matches.length ? [] : [{ key: "column", title: "add the owner column", body: "add it" }];
  } } });
  const later = await source.snapshot("acme/widgets");
  const laterHistory = await later.history("owner text");
  const items: GroomedWork[] = [];
  const briefRecords = new Map<string, BriefRecord>();
  const briefs: BriefStore = { get: async (id) => briefRecords.get(id) ?? null, write: async (input) => { const previous = briefRecords.get(input.id); const next = { ...input, questions: previous?.questions ?? [], createdAt: previous?.createdAt ?? input.at, updatedAt: input.at, revision: (previous?.revision ?? 0) + 1 }; briefRecords.set(input.id, next); return next; }, appendQuestion: async (input) => { const previous = briefRecords.get(input.id); if (previous === undefined) throw new Error(`no brief ${input.id}`); const next = { ...previous, questions: [...previous.questions, input.question], updatedAt: input.at, revision: previous.revision + 1 }; briefRecords.set(input.id, next); return next; }, retired: async () => [], remove: async () => {} };
  const tracker: GroomingTracker = { features: async () => [], getFeature: async () => null, groomedWork: async () => items.filter((x) => !x.retired), createGroomedWork: async (x) => { const item = { ...x, id: `W-${items.length + 1}`, retired: false }; items.push(item); return item; }, updateGroomedWork: async (id, x) => Object.assign(workBy(items, id), x), retireGroomedWork: async (id) => { workBy(items, id).retired = true; } };
  await briefs.write({ id: "F-1", sections: [{ name: "feature", body: "old" }], explains: [], at: "2026-09-17T11:00:00.000Z" });
  await briefs.appendQuestion({ id: "F-1", question: { workId: "human", question: "why?", at: "2026-09-17T11:30:00.000Z" }, at: "2026-09-17T11:30:00.000Z" });
  await groomFeature({ id: "F-1", title: "feature", repos: ["acme/widgets"] }, { source, tracker, briefs, now: () => new Date("2026-09-17T12:00:00.000Z"), groomer: { propose: async () => [{ key: "column", title: "column", body: "add column" }, { key: "removed", title: "removed", body: "remove me" }] } });
  await groomFeature({ id: "F-1", title: "feature", repos: ["acme/widgets"] }, { source, tracker, briefs, now: () => new Date("2026-09-17T13:00:00.000Z"), groomer: { propose: async () => [{ key: "column", title: "column revised", body: "add column" }] } });
  const standingAfter = run(checkout, "branch", "--show-current");
  const statusAfter = run(checkout, "status", "--porcelain");
  const worktreesAfter = run(checkout, "worktree", "list").split("\n").length;
  const assertions = {
    "groom.the_step_reads_the_base_branch": seen.includes("create table") && !seen.includes("private") && standingBefore === standingAfter && statusBefore === statusAfter && worktreesBefore === worktreesAfter,
    "groom.the_snapshot_sees_what_was_pushed_since_the_last_fetch": staleBefore !== added && pinned.revision === added && seen.includes("owner text") && groomed?.revision === added && /^\d{4}-\d\d-\d\dT/.test(groomed.committedAt),
    "groom.the_fetch_names_its_destination": fetchedTo === added,
    "groom.a_snapshot_is_pinned_to_its_commit": answersBefore === answersAfter && pinned.revision === added && later.revision === dropped,
    "groom.search_reads_the_base_not_the_tree": privateSearch.matches.length === 0 && !privateSearch.truncated && columnSearch.matches.length === 1 && columnSearch.matches[0]?.path === "schema.sql" && (await pinned.read(columnSearch.matches[0].path)) !== null,
    "groom.history_names_the_commit_that_added_it": groomed?.found.matches.length === 1 && groomed.history.entries.length === 1 && groomed.history.entries[0]?.commit === added && groomed.history.entries[0].change === "added" && !groomed.history.truncated && laterHistory.entries.map((e) => `${e.commit}:${e.change}`).join(",") === `${dropped}:removed,${added}:added`,
    "groom.a_second_run_retires_what_it_cut": items.some((x) => x.retired && x.title === "removed") && items.some((x) => !x.retired && x.title === "column revised") && briefRecords.get("F-1")?.revision === 4 && briefRecords.get("F-1")?.questions[0]?.question === "why?",
  };
  const passed = Object.values(assertions).every(Boolean);
  fs.writeFileSync(report, JSON.stringify({
    scenario: "feature-grooming",
    status: passed ? "passed" : "failed",
    goal: "Re-groom a feature against a freshly fetched, pinned commit of the base branch without changing the standing checkout, find a column somebody else pushed since the last fetch and the commit that added it, and retire only obsolete work the grooming workflow produced.",
    artifact: { package: "@amykit/workflow-feature-grooming", entry: "groomFeature with GitBaseSource", built_by: "npm run build" },
    observed: { assertions_run: Object.keys(assertions).length, assertions_failed: Object.values(assertions).filter((value) => !value).length },
    assertions: Object.entries(assertions).map(([type, value]) => ({ type, status: value ? "passed" : "failed" })),
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { fs.rmSync(root, { recursive: true, force: true }); }
