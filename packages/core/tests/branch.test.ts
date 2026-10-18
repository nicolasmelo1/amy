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

/**
 * The same real repositories, for the other half: a commit that stays local
 * until asked, and a push that is a fast-forward or nothing.
 */
describe("a commit is not a push", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-push-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    run(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    run(root, "clone", "-q", bare, checkout);
    run(checkout, "config", "user.email", "amy@example.test");
    run(checkout, "config", "user.name", "amy");
    commit(checkout, "the first commit");
    run(checkout, "push", "-q", "origin", "main");
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const git = () => new Git(new NodeCommandRunner(), { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" });
  const remoteTip = (branch: string) => {
    try {
      return run(bare, "rev-parse", `refs/heads/${branch}`);
    } catch {
      return null;
    }
  };

  it("commits without pushing, and the remote stays where it was", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    fs.writeFileSync(path.join(checkout, "round-1.md"), "one\n");

    expect(await git().commit("acme/widgets", "round 1")).toBe(true);

    expect(run(checkout, "log", "-1", "--format=%s")).toBe("round 1");
    expect(remoteTip("amy/item-1")).toBeNull();
    expect(await git().commit("acme/widgets", "nothing")).toBe(false);
  });

  it("pushes every round the remote has not seen, once", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    fs.writeFileSync(path.join(checkout, "round-1.md"), "one\n");
    await git().commit("acme/widgets", "round 1");
    fs.writeFileSync(path.join(checkout, "round-2.md"), "two\n");
    await git().commit("acme/widgets", "round 2");

    expect(await git().push("acme/widgets", "amy/item-1")).toBe(true);
    expect(remoteTip("amy/item-1")).toBe(run(checkout, "rev-parse", "HEAD"));
    expect(await git().push("acme/widgets", "amy/item-1")).toBe(false);
  });

  it("refuses a push that is not a fast-forward, naming the branch, and keeps the local commit", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    commit(checkout, "the work that was pushed");
    run(checkout, "push", "-q", "origin", "amy/item-1");
    const elsewhere = path.join(root, "elsewhere");
    run(root, "clone", "-q", "--branch", "amy/item-1", bare, elsewhere);
    const theirs = commit(elsewhere, "a suggestion committed on the forge");
    run(elsewhere, "push", "-q", "origin", "amy/item-1");
    fs.writeFileSync(path.join(checkout, "round-2.md"), "two\n");
    await git().commit("acme/widgets", "round 2");
    const ours = run(checkout, "rev-parse", "HEAD");

    await expect(git().push("acme/widgets", "amy/item-1")).rejects.toThrow(/refusing to push amy\/item-1.*not a fast-forward/);

    expect(run(checkout, "rev-parse", "HEAD")).toBe(ours);
    expect(remoteTip("amy/item-1")).toBe(theirs);
  });

  it("publishes a new branch cut at a commit another branch already pushed", async () => {
    await git().prepareBranch("acme/widgets", "amy/parent");
    fs.writeFileSync(path.join(checkout, "parent.md"), "parent\n");
    await git().commitAndPush("acme/widgets", "amy/parent", "the parent");
    run(checkout, "checkout", "-q", "-b", "amy/child");

    expect(await git().push("acme/widgets", "amy/child")).toBe(true);

    expect(remoteTip("amy/child")).toBe(remoteTip("amy/parent"));
    expect(await git().push("acme/widgets", "amy/child")).toBe(false);
  });

  it("still commits and pushes in one call", async () => {
    await git().prepareBranch("acme/widgets", "amy/item-1");
    fs.writeFileSync(path.join(checkout, "work.md"), "work\n");

    expect(await git().commitAndPush("acme/widgets", "amy/item-1", "the work")).toBe(true);

    expect(remoteTip("amy/item-1")).toBe(run(checkout, "rev-parse", "HEAD"));
    expect(run(checkout, "log", "-1", "--format=%s")).toBe("the work");
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
