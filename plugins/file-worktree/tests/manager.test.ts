import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CommandRunner, CommandResult, Event } from "@amykit/core";
import { WorktreeManager } from "../src/manager.js";

/**
 * A real git repository and a real runner, because the claim is about
 * checkout isolation: the trees are real checkouts, the branches are real
 * branches, and a scripted runner would only prove the script.
 */
class RealRunner implements CommandRunner {
  run(command: string, args: readonly string[], options?: { cwd?: string }): Promise<CommandResult> {
    try {
      const stdout = execFileSync(command, [...args], {
        cwd: options?.cwd,
        env: isolatedGitEnvironment(),
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return Promise.resolve({ ok: true, exitCode: 0, stdout, stderr: "" });
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      return Promise.resolve({
        ok: false,
        exitCode: e.status ?? 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      });
    }
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: isolatedGitEnvironment(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Git invokes hooks with GIT_INDEX_FILE pointing at the caller's index. The
 * real repositories in these tests must use their own indexes instead.
 */
function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith("GIT_")) delete env[name];
  }
  return env;
}

/** A bare origin with one commit on main, which is what an install has. */
function origin(root: string, name: string): string {
  const bare = path.join(root, `${name}.git`);
  execFileSync("git", ["init", "--bare", "--initial-branch=main", bare], { stdio: "ignore" });

  const seed = path.join(root, `seed-${name}`);
  execFileSync("git", ["clone", "-q", bare, seed], { stdio: "ignore" });
  git(seed, "config", "user.email", "amy@example.test");
  git(seed, "config", "user.name", "amy");
  fs.writeFileSync(path.join(seed, "README.md"), "seed\n", "utf-8");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "the first commit");
  git(seed, "push", "-q", "origin", "main");
  return bare;
}

describe("the worktree manager", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-worktree-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function managerFor(
    overrides: Partial<ConstructorParameters<typeof WorktreeManager>[1]> = {},
  ): WorktreeManager {
    return new WorktreeManager(new RealRunner(), {
      root: path.join(root, "trees"),
      workflow: "tickets",
      defaultBranch: "main",
      retentionDays: 7,
      record: (workId) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(root, "records", `${workId}.json`), "utf-8"),
          ) as { state: string };
        } catch {
          return null;
        }
      },
      terminalStates: ["DONE"],
      ...overrides,
    });
  }

  function aRecord(workId: string, state: string): void {
    fs.mkdirSync(path.join(root, "records"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "records", `${workId}.json`),
      `${JSON.stringify({ id: workId, state })}\n`,
      "utf-8",
    );
  }

  it("cuts each item its own tree, from the default branch", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor();

    const first = await manager.acquire("ITEM-1", repo);
    const second = await manager.acquire("ITEM-2", repo);

    expect(first).not.toBe(second);
    expect(fs.existsSync(path.join(first, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(second, ".git"))).toBe(true);
    // Both stand on the default branch's commit.
    expect(git(first, "rev-parse", "HEAD")).toBe(git(second, "rev-parse", "HEAD"));
  });

  it("reuses a tree it already cut, rather than resetting it", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor();

    const tree = await manager.acquire("ITEM-1", repo);
    fs.writeFileSync(path.join(tree, "note.txt"), "the agent's work\n", "utf-8");

    const again = await manager.acquire("ITEM-1", repo);
    expect(again).toBe(tree);
    expect(fs.readFileSync(path.join(again, "note.txt"), "utf-8")).toBe("the agent's work\n");
  });

  it("never touches the standing checkout's branch or files", async () => {
    const bare = path.join(root, "widgets.git");
    origin(root, "widgets");

    const standing = path.join(root, "standing");
    execFileSync("git", ["clone", "-q", bare, standing], { stdio: "ignore" });
    git(standing, "config", "user.email", "amy@example.test");
    git(standing, "config", "user.name", "amy");
    git(standing, "checkout", "-q", "-b", "operator/working");
    fs.writeFileSync(path.join(standing, "uncommitted.txt"), "somebody's work\n", "utf-8");

    const manager = managerFor();
    await manager.acquire("ITEM-1", bare);

    expect(git(standing, "branch", "--show-current")).toBe("operator/working");
    expect(fs.existsSync(path.join(standing, "uncommitted.txt"))).toBe(true);
    expect(git(standing, "status", "--porcelain")).toContain("uncommitted.txt");
  });

  it("prepares an item's branch inside its own tree, and never repoints the standing checkout", async () => {
    const bare = path.join(root, "widgets.git");
    origin(root, "widgets");

    const standing = path.join(root, "standing");
    execFileSync("git", ["clone", "-q", bare, standing], { stdio: "ignore" });
    git(standing, "config", "user.email", "amy@example.test");
    git(standing, "config", "user.name", "amy");
    git(standing, "checkout", "-q", "-b", "operator/on-one");

    const { Git } = await import("@amykit/core");
    const manager = managerFor();
    const bridge = new Git(
      new RealRunner(),
      { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" },
      manager,
    );

    await bridge.prepareBranch(bare, "amy/item-1", "ITEM-1");
    await bridge.prepareBranch(bare, "amy/item-2", "ITEM-2");

    // Each tree carries its own branch; the standing checkout is where the
    // operator left it, and neither item moved it.
    expect(git(manager.pathFor("ITEM-1", bare), "branch", "--show-current")).toBe("amy/item-1");
    expect(git(manager.pathFor("ITEM-2", bare), "branch", "--show-current")).toBe("amy/item-2");
    expect(git(standing, "branch", "--show-current")).toBe("operator/on-one");
  });

  it("names state, workflow, work id, repo, branch and cleanliness", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor();

    aRecord("ITEM-1", "IMPLEMENTING");

    await manager.acquire("ITEM-1", repo);
    await manager.acquire("ITEM-2", repo);

    const states = await manager.states();
    const first = states.find((s) => s.workId === "ITEM-1")!;
    const second = states.find((s) => s.workId === "ITEM-2")!;

    expect(first.workflow).toBe("tickets");
    expect(first.repo).toBe(repo);
    expect(first.state).toBe("in-flight");
    expect(first.clean).toBe(true);

    // A tree whose work the store no longer holds is orphaned, not in flight.
    expect(second.state).toBe("orphaned");
    expect(second.retentionEligible).toBe(false);
  });

  it("never prunes an in-flight or dirty tree", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor({ retentionDays: 0 });

    aRecord("ITEM-1", "IMPLEMENTING");

    await manager.acquire("ITEM-1", repo);
    fs.writeFileSync(path.join(manager.pathFor("ITEM-1", repo), "wip.txt"), "half done\n", "utf-8");

    const removed = await manager.prune(new Date());
    expect(removed).toEqual([]);
    expect(fs.existsSync(manager.pathFor("ITEM-1", repo))).toBe(true);
    expect(fs.readFileSync(path.join(manager.pathFor("ITEM-1", repo), "wip.txt"), "utf-8")).toBe("half done\n");
  });

  it("prunes a terminal, clean tree past its retention, and logs the removal", async () => {
    const repo = origin(root, "widgets");
    const events: Event[] = [];
    const manager = managerFor({
      retentionDays: 0,
      log: { append: (event: Event) => events.push(event), read: () => [] },
    });

    aRecord("ITEM-1", "DONE");

    await manager.acquire("ITEM-1", repo);
    const removed = await manager.prune(new Date());

    expect(removed).toEqual(["ITEM-1"]);
    expect(fs.existsSync(manager.pathFor("ITEM-1", repo))).toBe(false);
    expect(
      events.some((e) => e.kind === "worktree.removed" && e.detail?.workId === "ITEM-1"),
    ).toBe(true);
  });

  it("refuses to release an in-flight tree, and names the reason", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor();

    aRecord("ITEM-1", "IMPLEMENTING");

    await manager.acquire("ITEM-1", repo);

    await expect(manager.release("ITEM-1", repo)).rejects.toThrow("the work is still going");
    expect(fs.existsSync(manager.pathFor("ITEM-1", repo))).toBe(true);
  });

  it("releases a forced removal over the refusal", async () => {
    const repo = origin(root, "widgets");
    const manager = managerFor();

    aRecord("ITEM-1", "IMPLEMENTING");

    await manager.acquire("ITEM-1", repo);
    expect(await manager.release("ITEM-1", repo, { force: true })).toBe(true);
    expect(fs.existsSync(manager.pathFor("ITEM-1", repo))).toBe(false);
  });
});