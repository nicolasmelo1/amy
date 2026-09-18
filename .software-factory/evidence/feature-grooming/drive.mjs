#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repo, report] = process.argv.slice(2);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-grooming-"));
const run = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
try {
  const remote = path.join(root, "remote.git");
  const checkout = path.join(root, "checkout");
  run(root, "init", "--bare", remote);
  run(root, "clone", remote, checkout);
  run(checkout, "config", "user.email", "e2e@example.test"); run(checkout, "config", "user.name", "E2E");
  fs.writeFileSync(path.join(checkout, "schema.sql"), "create table items (id text);\n");
  run(checkout, "add", "."); run(checkout, "commit", "-m", "base"); run(checkout, "branch", "-M", "main"); run(checkout, "push", "-u", "origin", "main");
  run(checkout, "checkout", "-b", "private-work");
  fs.writeFileSync(path.join(checkout, "schema.sql"), "private column only\n");
  const standingBefore = run(checkout, "branch", "--show-current");
  const worktreesBefore = run(checkout, "worktree", "list").split("\n").length;
  const { GitBaseSource } = await import(pathToFileURL(path.join(repo, "packages/core/dist/index.js")).href);
  const { groomFeature } = await import(pathToFileURL(path.join(repo, "packages/workflow-feature-grooming/dist/index.js")).href);
  const source = new GitBaseSource({ run: async (command, args, options) => { try { return { ok: true, exitCode: 0, stdout: execFileSync(command, args, { cwd: options?.cwd, encoding: "utf8" }), stderr: "" }; } catch (error) { return { ok: false, exitCode: 1, stdout: "", stderr: String(error.stderr ?? error) }; } } }, { workspaceRoot: root, checkouts: { "acme/widgets": checkout }, defaultBranch: "main" });
  const seen = await (await source.snapshot("acme/widgets")).read("schema.sql");
  const items = [];
  const briefRecords = new Map();
  const briefs = { get: async (id) => briefRecords.get(id) ?? null, write: async (input) => { const previous = briefRecords.get(input.id); const next = { ...input, questions: previous?.questions ?? [], revision: (previous?.revision ?? 0) + 1 }; briefRecords.set(input.id, next); return next; }, appendQuestion: async (input) => { const previous = briefRecords.get(input.id); const next = { ...previous, questions: [...previous.questions, input.question], revision: previous.revision + 1 }; briefRecords.set(input.id, next); return next; }, retired: async () => [], remove: async () => {} };
  const tracker = { features: async () => [], getFeature: async () => null, groomedWork: async () => items.filter((x) => !x.retired), createGroomedWork: async (x) => { const item = { ...x, id: `W-${items.length + 1}`, retired: false }; items.push(item); return item; }, updateGroomedWork: async (id, x) => Object.assign(items.find((i) => i.id === id), x), retireGroomedWork: async (id) => { items.find((i) => i.id === id).retired = true; } };
  await briefs.write({ id: "F-1", sections: [{ name: "feature", body: "old" }], explains: [], at: "2026-09-17T11:00:00.000Z" });
  await briefs.appendQuestion({ id: "F-1", question: { workId: "human", question: "why?", at: "2026-09-17T11:30:00.000Z" }, at: "2026-09-17T11:30:00.000Z" });
  await groomFeature({ id: "F-1", title: "feature", repos: ["acme/widgets"] }, { source, tracker, briefs, now: () => new Date("2026-09-17T12:00:00.000Z"), groomer: { propose: async () => [{ key: "column", title: "column", body: "add column" }, { key: "removed", title: "removed", body: "remove me" }] } });
  await groomFeature({ id: "F-1", title: "feature", repos: ["acme/widgets"] }, { source, tracker, briefs, now: () => new Date("2026-09-17T13:00:00.000Z"), groomer: { propose: async () => [{ key: "column", title: "column revised", body: "add column" }] } });
  const standingAfter = run(checkout, "branch", "--show-current");
  const worktreesAfter = run(checkout, "worktree", "list").split("\n").length;
  const assertions = {
    "groom.the_step_reads_the_base_branch": seen.includes("create table") && !seen.includes("private") && standingBefore === standingAfter && worktreesBefore === worktreesAfter,
    "groom.a_second_run_retires_what_it_cut": items.some((x) => x.retired && x.title === "removed") && items.some((x) => !x.retired && x.title === "column revised") && briefRecords.get("F-1").revision === 4 && briefRecords.get("F-1").questions[0].question === "why?",
  };
  fs.writeFileSync(report, JSON.stringify({
    scenario: "feature-grooming",
    status: Object.values(assertions).every(Boolean) ? "passed" : "failed",
    goal: "Re-groom a feature against configured base-branch source without changing the standing checkout, and retire only obsolete work the grooming workflow produced.",
    artifact: { package: "@amykit/workflow-feature-grooming", entry: "groomFeature with GitBaseSource", built_by: "npm run build" },
    observed: { assertions_run: 2, assertions_failed: Object.values(assertions).filter((value) => !value).length },
    assertions: Object.entries(assertions).map(([type, value]) => ({ type, status: value ? "passed" : "failed" })),
  }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
