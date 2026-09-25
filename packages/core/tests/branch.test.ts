import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git } from "../src/git.js";
import { NodeCommandRunner } from "../src/NodeCommandRunner.js";

/**
 * Real repositories, because the claim is about what git does to a commit: a
 * scripted runner would only prove the script. The machine committed, the
 * push failed, and the next look prepares the branch again.
 */
describe("a commit the machine made and could not push", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    // A hook running this suite exports GIT_INDEX_FILE and friends; these
    // repositories must use their own.
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-branch-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    run(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    run(root, "clone", "-q", bare, checkout);
    commit(checkout, "the first commit");
    run(checkout, "push", "-q", "origin", "main");
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const git = () => new Git(new NodeCommandRunner(), { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" });

  it("survives preparing a branch the remote never had", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    const unpushed = commit(checkout, "the work nobody pushed");

    await git().prepareBranch("acme/widgets", "amy/item-1");

    expect(run(checkout, "rev-parse", "HEAD")).toBe(unpushed);
    expect(run(checkout, "branch", "--show-current")).toBe("amy/item-1");
  });

  it("survives preparing a branch the remote has an older tip of", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    commit(checkout, "the work that was pushed");
    run(checkout, "push", "-q", "origin", "amy/item-1");
    const unpushed = commit(checkout, "the work nobody pushed");

    await git().prepareBranch("acme/widgets", "amy/item-1");

    expect(run(checkout, "rev-parse", "HEAD")).toBe(unpushed);
  });

  it("is pushed by the next push, even when the agent changed nothing", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    const unpushed = commit(checkout, "the work nobody pushed");

    await git().prepareBranch("acme/widgets", "amy/item-1");
    const pushed = await git().commitAndPush("acme/widgets", "amy/item-1", "nothing new");

    expect(pushed).toBe(true);
    expect(run(bare, "rev-parse", "refs/heads/amy/item-1")).toBe(unpushed);
  });

  it("fast-forwards a branch somebody else moved on the remote", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    commit(checkout, "the work that was pushed");
    run(checkout, "push", "-q", "origin", "amy/item-1");
    const elsewhere = path.join(root, "elsewhere");
    run(root, "clone", "-q", "--branch", "amy/item-1", bare, elsewhere);
    const theirs = commit(elsewhere, "a fixup somebody pushed");
    run(elsewhere, "push", "-q", "origin", "amy/item-1");

    await git().prepareBranch("acme/widgets", "amy/item-1");

    expect(run(checkout, "rev-parse", "HEAD")).toBe(theirs);
  });

  it("refuses a branch that diverged, and leaves both sides where they were", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    commit(checkout, "the work that was pushed");
    run(checkout, "push", "-q", "origin", "amy/item-1");
    const elsewhere = path.join(root, "elsewhere");
    run(root, "clone", "-q", "--branch", "amy/item-1", bare, elsewhere);
    const theirs = commit(elsewhere, "a fixup somebody pushed");
    run(elsewhere, "push", "-q", "origin", "amy/item-1");
    const ours = commit(checkout, "the work nobody pushed");

    await expect(git().prepareBranch("acme/widgets", "amy/item-1")).rejects.toThrow(
      /amy\/item-1 has diverged from origin\/amy\/item-1[\s\S]*the work nobody pushed/,
    );
    expect(run(checkout, "rev-parse", "HEAD")).toBe(ours);
    expect(run(bare, "rev-parse", "refs/heads/amy/item-1")).toBe(theirs);
  });
});

function run(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** One commit with a file of its own, answered by its sha. */
function commit(cwd: string, message: string): string {
  fs.writeFileSync(path.join(cwd, `${message.replace(/\W+/g, "-")}.md`), `${message}\n`, "utf-8");
  run(cwd, "add", "-A");
  run(cwd, "-c", "user.email=amy@example.test", "-c", "user.name=amy", "commit", "-q", "-m", message);
  return run(cwd, "rev-parse", "HEAD");
}
