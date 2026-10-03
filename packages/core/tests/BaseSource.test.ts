import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitBaseSource } from "../src/ports/BaseSource.js";
import { NodeCommandRunner } from "../src/NodeCommandRunner.js";
import type { CommandResult, CommandRunner } from "../src/ports/CommandRunner.js";

const notOnWindows = process.platform !== "win32";

/**
 * Real repositories, because every claim here is about what git answers at
 * one commit: a scripted runner would only prove the script.
 */
describe("a base-source snapshot", () => {
  let root: string;
  let checkout: string;
  let author: string;
  let calls: string[][];
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    // A hook running this suite exports GIT_INDEX_FILE and friends; these
    // repositories must use their own.
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-base-source-"));
    const bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkout");
    author = path.join(root, "author");
    git(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    git(root, "clone", "-q", bare, author);
    commit(author, "base", { "schema.sql": "create table items (id text);\n" });
    git(author, "push", "-q", "origin", "main");
    git(root, "clone", "-q", bare, checkout);
    calls = [];
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const recording: CommandRunner = {
    run: async (command, args, options) => {
      calls.push([...args]);
      return new NodeCommandRunner().run(command, args, options);
    },
  };
  const source = (runner: CommandRunner = recording) =>
    new GitBaseSource(runner, { workspaceRoot: root, checkouts: { "acme/widgets": checkout }, defaultBranch: "main" });

  it("refuses when the fetch fails, naming the repository and git's words, and never reads the old ref", async () => {
    git(checkout, "remote", "set-url", "origin", path.join(root, "gone.git"));

    await expect(source().snapshot("acme/widgets")).rejects.toThrow(/acme\/widgets: .*gone\.git/s);
    expect(calls.map((args) => args[0])).toEqual(["fetch"]);
  });

  it("carries the full commit and its time, and every later call names that commit rather than the branch", async () => {
    const head = git(author, "rev-parse", "HEAD");
    const at = git(author, "log", "-1", "--format=%cI");

    const snapshot = await source().snapshot("acme/widgets");
    await snapshot.read("schema.sql");
    await snapshot.search("items");
    await snapshot.history("items");

    expect(snapshot.revision).toBe(head);
    expect(snapshot.committedAt).toBe(at);
    const later = calls.slice(2);
    expect(later.length).toBeGreaterThanOrEqual(3);
    for (const args of later) {
      expect(args.join(" ")).not.toContain("origin/");
      expect(args.some((arg) => arg.startsWith(head))).toBe(true);
    }
  });

  it("finds a literal text and returns paths a read accepts", async () => {
    commit(author, "regex looking", { "src/a.ts": "const pattern = 'a.b';\nconst other = 'axb';\n" });
    git(author, "push", "-q", "origin", "main");

    const snapshot = await source().snapshot("acme/widgets");
    const found = await snapshot.search("a.b");

    expect(found).toEqual({ matches: [{ path: "src/a.ts", line: 1, text: "const pattern = 'a.b';" }], truncated: false });
    expect(await snapshot.read(found.matches[0]!.path)).toContain("a.b");
    expect((await snapshot.search("a.b", { regex: true })).matches).toHaveLength(2);
  });

  it("says when its limit cut the matches, and not when it did not", async () => {
    commit(author, "many", { "many.txt": "needle\nneedle\nneedle\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");

    expect(await snapshot.search("needle", { limit: 2 })).toMatchObject({ truncated: true, matches: [{ line: 1 }, { line: 2 }] });
    expect(await snapshot.search("needle", { limit: 3 })).toMatchObject({ truncated: false });
    expect(await snapshot.search("nowhere")).toEqual({ matches: [], truncated: false });
  });

  it("does not return a binary blob as a match", async () => {
    commit(author, "a binary", { "blob.bin": Buffer.from([0, 1, 2, ...Buffer.from("needle"), 0]), "notes.md": "needle here\n" });
    git(author, "push", "-q", "origin", "main");

    const found = await (await source().snapshot("acme/widgets")).search("needle");

    expect(found.matches).toEqual([{ path: "notes.md", line: 1, text: "needle here" }]);
  });

  // Windows cannot name a file with a colon or a newline in it, so the tree cannot be written there.
  it.runIf(notOnWindows)("returns a path containing a colon or a newline whole", async () => {
    commit(author, "odd paths", { "docs/a:b.md": "needle here\n", "docs/two\nlines.md": "a needle\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");

    const found = await snapshot.search("needle");

    expect(found.matches).toEqual([{ path: "docs/a:b.md", line: 1, text: "needle here" }, { path: "docs/two\nlines.md", line: 1, text: "a needle" }]);
    expect(await snapshot.read(found.matches[1]!.path)).toBe("a needle");
  });

  it("refuses an empty text before asking git", async () => {
    const snapshot = await source().snapshot("acme/widgets");
    const before = calls.length;

    await expect(snapshot.search("")).rejects.toThrow(/empty/);
    await expect(snapshot.history("")).rejects.toThrow(/empty/);
    expect(calls.length).toBe(before);
  });

  it("writes no tag into the checkout, only the remote-tracking ref", async () => {
    // Git follows a tag only onto a commit the fetch brings in, so the tag sits on a new one.
    commit(author, "released", { "release.md": "v1\n" });
    git(author, "tag", "v1");
    git(author, "push", "-q", "origin", "main", "v1");

    const snapshot = await source().snapshot("acme/widgets");

    expect(snapshot.revision).toBe(git(author, "rev-parse", "HEAD"));
    expect(git(checkout, "tag", "--list")).toBe("");
  });

  it("refuses a limit that is not a whole number of zero or more, before asking git", async () => {
    const snapshot = await source().snapshot("acme/widgets");
    const before = calls.length;

    for (const limit of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
      await expect(snapshot.search("items", { limit })).rejects.toThrow(/limit/);
      await expect(snapshot.history("items", { limit })).rejects.toThrow(/limit/);
    }
    expect(calls.length).toBe(before);
    expect(await snapshot.search("items", { limit: 0 })).toEqual({ matches: [], truncated: true });
  });

  it("searches for a text beginning with a dash instead of reading it as a flag", async () => {
    commit(author, "flags", { "cli.ts": "args.push('--force');\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");

    expect((await snapshot.search("--force")).matches).toEqual([{ path: "cli.ts", line: 1, text: "args.push('--force');" }]);
    expect((await snapshot.history("--force")).entries).toMatchObject([{ subject: "flags", change: "added" }]);
  });

  it("names the commits that added and removed a text, up to its own commit and no further", async () => {
    const added = commit(author, "add the column", { "schema.sql": "create table items (id text, owner text);\n" });
    const removed = commit(author, "drop the column", { "schema.sql": "create table items (id text);\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");
    commit(author, "add it back", { "schema.sql": "create table items (id text, owner text);\n" });
    git(author, "push", "-q", "origin", "main");
    await source().snapshot("acme/widgets");

    expect(await snapshot.history("owner text")).toEqual({
      entries: [
        { commit: removed, at: expect.any(String), subject: "drop the column", change: "removed" },
        { commit: added, at: expect.any(String), subject: "add the column", change: "added" },
      ],
      truncated: false,
    });
  });

  it("names a merge whose conflict resolution introduced a text, and not a merge that only brought a branch in", async () => {
    git(author, "checkout", "-q", "-b", "side");
    const sideCommit = commit(author, "side adds a column", { "schema.sql": "create table items (id text, side text);\n", "clean.sql": "clean_column\n" });
    git(author, "checkout", "-q", "main");
    commit(author, "main adds a column", { "schema.sql": "create table items (id text, main text);\n" });
    // The merge stops on the conflict, which is the point: the commit below is its resolution.
    expect(() => git(author, "merge", "-q", "--no-commit", "side")).toThrow();
    const merged = commit(author, "resolve the columns", { "schema.sql": "create table items (id text, resolved text);\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");

    expect((await snapshot.history("resolved text")).entries).toMatchObject([{ commit: merged, change: "added" }]);
    expect((await snapshot.history("clean_column")).entries).toMatchObject([{ commit: sideCommit, change: "added" }]);
  });

  it("says when its limit cut the history, and not when it did not", async () => {
    commit(author, "one", { "a.txt": "needle\n" });
    commit(author, "two", { "b.txt": "needle\n" });
    commit(author, "three", { "c.txt": "needle\n" });
    git(author, "push", "-q", "origin", "main");
    const snapshot = await source().snapshot("acme/widgets");

    expect(await snapshot.history("needle", { limit: 2 })).toMatchObject({ truncated: true, entries: [{ subject: "three" }, { subject: "two" }] });
    expect(await snapshot.history("needle", { limit: 3 })).toMatchObject({ truncated: false, entries: [{}, {}, { subject: "one" }] });
  });

  it("answers a missing file with null and refuses any other failure", async () => {
    const snapshot = await source().snapshot("acme/widgets");
    expect(await snapshot.read("nope.txt")).toBeNull();

    const broken: CommandRunner = {
      run: async (command, args, options): Promise<CommandResult> =>
        args[0] === "show" ? { ok: false, exitCode: 128, stdout: "", stderr: "fatal: bad object" } : new NodeCommandRunner().run(command, args, options),
    };
    await expect((await source(broken).snapshot("acme/widgets")).read("schema.sql")).rejects.toThrow(/schema\.sql in acme\/widgets: fatal: bad object/);
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** One commit writing the given files, answered by its sha. */
function commit(cwd: string, message: string, files: Record<string, string | Buffer>): string {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content);
  }
  git(cwd, "add", "-A");
  git(cwd, "-c", "user.email=amy@example.test", "-c", "user.name=amy", "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}
