import { describe, it, expect } from "vitest";
import { baseBranchFor, Git } from "@amykit/core";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";

const layout = { workspaceRoot: "/home/dev/workspaces/northwind", defaultBranch: "main" };

describe("baseBranchFor", () => {
  it("answers the repository's own branch when the layout named one", () => {
    const own = { ...layout, baseBranch: { "Northwind/northwind-backend": "trunk" } };

    expect(baseBranchFor(own, "Northwind/northwind-backend")).toBe("trunk");
  });

  it("keeps the fallback for a repository that named none", () => {
    const own = { ...layout, baseBranch: { "Northwind/northwind-backend": "trunk" } };

    expect(baseBranchFor(own, "Northwind/northwind-frontend")).toBe("main");
  });

  it("is the default branch when nothing is mapped at all", () => {
    expect(baseBranchFor(layout, "Northwind/northwind-backend")).toBe("main");
  });
});

describe("Git.pathFor", () => {
  it("drops the owner to find the local checkout", () => {
    const git = new Git(new ScriptedRunner(), layout);

    expect(git.pathFor("Northwind/northwind-backend")).toBe(
      "/home/dev/workspaces/northwind/northwind-backend",
    );
  });

  it("takes a bare name as-is", () => {
    const git = new Git(new ScriptedRunner(), layout);

    expect(git.pathFor("northwind-backend")).toBe(
      "/home/dev/workspaces/northwind/northwind-backend",
    );
  });
});

describe("Git.pathFor, when a repository names its own root", () => {
  const own = { ...layout, checkouts: { "Northwind/northwind-backend": "/work/backend" } };

  it("finds it there, and nowhere under the shared root", () => {
    const git = new Git(new ScriptedRunner(), own);

    expect(git.pathFor("Northwind/northwind-backend")).toBe("/work/backend");
  });

  it("still finds the rest under the shared root", () => {
    const git = new Git(new ScriptedRunner(), own);

    expect(git.pathFor("Northwind/northwind-frontend")).toBe(
      "/home/dev/workspaces/northwind/northwind-frontend",
    );
  });
});

describe("Git.prepareBranch", () => {
  it("tracks the remote branch when it already exists", async () => {
    const runner = new ScriptedRunner();

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "ada/proj-1239");

    // Behaviour changed: a branch that exists locally is checked out and
    // fast-forwarded to the remote, never reset onto it.
    expect(runner.calls.find((call) => call.args[0] === "checkout")?.args).toEqual(["checkout", "ada/proj-1239"]);
    expect(runner.calls.find((call) => call.args[0] === "merge")?.args).toEqual([
      "merge",
      "--ff-only",
      "origin/ada/proj-1239",
    ]);
  });

  it("cuts a new branch off the default when the remote has none", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("rev-parse", "--verify"), result: { exitCode: 1 } },
    ]);

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "ada/proj-1239");

    const checkout = runner.calls.find((call) => call.args[0] === "checkout");
    expect(checkout?.args).toEqual(["checkout", "-b", "ada/proj-1239", "origin/main"]);
  });

  it("cuts a new branch off the base the repository named, not the fallback", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("rev-parse", "--verify"), result: { exitCode: 1 } },
    ]);
    const own = { ...layout, baseBranch: { "Northwind/northwind-backend": "trunk" } };

    await new Git(runner, own).prepareBranch("Northwind/northwind-backend", "ada/proj-1239");

    const checkout = runner.calls.find((call) => call.args[0] === "checkout");
    expect(checkout?.args).toEqual(["checkout", "-b", "ada/proj-1239", "origin/trunk"]);
  });

  it("cuts a repository without a mapping off the fallback, in the same install", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("rev-parse", "--verify"), result: { exitCode: 1 } },
    ]);
    const own = { ...layout, baseBranch: { "Northwind/northwind-backend": "trunk" } };

    await new Git(runner, own).prepareBranch("Northwind/northwind-frontend", "ada/proj-1240");

    const checkout = runner.calls.find((call) => call.args[0] === "checkout");
    expect(checkout?.args).toEqual(["checkout", "-b", "ada/proj-1240", "origin/main"]);
  });

  it("fetches before deciding", async () => {
    const runner = new ScriptedRunner();

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "b");

    expect(runner.calls[0]?.args).toEqual(["fetch", "origin", "--prune"]);
  });

  it("runs inside the repository's own checkout", async () => {
    const runner = new ScriptedRunner();

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "b");

    expect(runner.calls[0]?.options?.cwd).toBe("/home/dev/workspaces/northwind/northwind-backend");
  });

  it("reports a failing git command with its output", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("fetch"), result: { exitCode: 128, stderr: "no such remote" } },
    ]);

    await expect(
      new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "b"),
    ).rejects.toThrow(/git fetch origin --prune failed .*no such remote/);
  });
});

describe("Git.commitAndPush", () => {
  it("commits and pushes when the tree is dirty", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("status", "--porcelain"), result: { stdout: " M src/invoice.ts" } },
    ]);

    const pushed = await new Git(runner, layout).commitAndPush(
      "Northwind/northwind-backend",
      "ada/proj-1239",
      "PROJ-1239: The total is wrong",
    );

    expect(pushed).toBe(true);
    expect(runner.calls.map((c) => c.args[0])).toEqual(["status", "add", "commit", "push"]);
    expect(runner.calls.find((c) => c.args[0] === "commit")?.args).toEqual([
      "commit",
      "-m",
      "PROJ-1239: The total is wrong",
    ]);
    expect(runner.calls.find((c) => c.args[0] === "push")?.args).toEqual([
      "push",
      "--set-upstream",
      "origin",
      "ada/proj-1239",
    ]);
  });

  it("says nothing happened rather than making an empty commit", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("status", "--porcelain"), result: { stdout: "" } },
    ]);

    const pushed = await new Git(runner, layout).commitAndPush("Northwind/northwind-backend", "b", "m");

    expect(pushed).toBe(false);
    // Behaviour changed: a clean tree still asks whether an earlier commit
    // was never pushed, and pushes nothing when none was.
    expect(runner.calls.map((c) => c.args[0])).toEqual(["status", "rev-list"]);
  });
});

/**
 * A local branch can hold a commit the remote never saw: the machine
 * committed and the push failed. Preparing the branch again must never be
 * the thing that erases it.
 */
describe("Git.prepareBranch, when the branch already exists locally", () => {
  const branch = "ada/proj-1239";
  const repo = "Northwind/northwind-backend";
  const answers = (answer: { local?: boolean; remote?: boolean; localBehind?: boolean; remoteBehind?: boolean }) =>
    new ScriptedRunner([
      { match: whenArgsInclude("rev-parse", `refs/heads/${branch}`), result: { exitCode: answer.local === false ? 1 : 0 } },
      { match: whenArgsInclude("rev-parse", `refs/remotes/origin/${branch}`), result: { exitCode: answer.remote === false ? 1 : 0 } },
      { match: (_c, args) => args[0] === "merge-base" && args[2] === `refs/heads/${branch}`, result: { exitCode: answer.localBehind === false ? 1 : 0 } },
      { match: (_c, args) => args[0] === "merge-base" && args[2] === `refs/remotes/origin/${branch}`, result: { exitCode: answer.remoteBehind === false ? 1 : 0 } },
      { match: whenArgsInclude("log", "--oneline"), result: { stdout: "abc1234 PROJ-1239: The total is wrong\n" } },
    ]);
  const commands = (runner: ScriptedRunner) => runner.calls.map((call) => call.args.join(" "));

  it("creates it from the remote branch when only the remote has it", async () => {
    const runner = answers({ local: false });

    await new Git(runner, layout).prepareBranch(repo, branch);

    expect(commands(runner)).toContain(`checkout -b ${branch} origin/${branch}`);
  });

  it("fast-forwards it when the remote is ahead", async () => {
    const runner = answers({});

    await new Git(runner, layout).prepareBranch(repo, branch);

    expect(commands(runner)).toContain(`merge-base --is-ancestor refs/heads/${branch} origin/${branch}`);
    expect(commands(runner).slice(-2)).toEqual([`checkout ${branch}`, `merge --ff-only origin/${branch}`]);
  });

  it("keeps a commit that was never pushed when the remote has the branch", async () => {
    const runner = answers({ localBehind: false });

    await new Git(runner, layout).prepareBranch(repo, branch);

    expect(commands(runner).at(-1)).toBe(`checkout ${branch}`);
    expect(commands(runner).some((line) => /checkout -B|reset|merge --ff-only/.test(line))).toBe(false);
  });

  it("keeps a commit that was never pushed when the remote never had the branch", async () => {
    const runner = answers({ remote: false, localBehind: false });

    await new Git(runner, layout).prepareBranch(repo, branch);

    expect(commands(runner).at(-1)).toBe(`checkout ${branch}`);
    expect(commands(runner).some((line) => line.startsWith("checkout") && line.includes("origin/main"))).toBe(false);
  });

  it("refuses a branch that diverged from its remote, naming what only the local side holds", async () => {
    const runner = answers({ localBehind: false, remoteBehind: false });

    await expect(new Git(runner, layout).prepareBranch(repo, branch)).rejects.toThrow(
      /ada\/proj-1239 has diverged from origin\/ada\/proj-1239[\s\S]*abc1234 PROJ-1239: The total is wrong/,
    );
    expect(commands(runner).some((line) => line.startsWith("checkout"))).toBe(false);
  });

  it("carries the worktree flag on every checkout in an item's own tree", async () => {
    const runner = answers({ localBehind: false });
    const tree = "/trees/PROJ-1239/northwind-backend";
    const trees = { acquire: async () => tree, pathFor: () => tree };

    await new Git(runner, layout, trees as never).prepareBranch(repo, branch, "PROJ-1239");

    expect(commands(runner).at(-1)).toBe(`checkout ${branch} --ignore-other-worktrees`);
    expect(runner.calls.every((call) => call.options?.cwd === tree)).toBe(true);
  });
});

describe("Git.commitAndPush, when an earlier push never arrived", () => {
  it("pushes the commit a clean tree still holds, and says so", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("status", "--porcelain"), result: { stdout: "" } },
      { match: whenArgsInclude("rev-list", "--count"), result: { stdout: "1\n" } },
    ]);

    const pushed = await new Git(runner, layout).commitAndPush("Northwind/northwind-backend", "ada/proj-1239", "m");

    expect(pushed).toBe(true);
    expect(runner.calls.map((c) => c.args.join(" "))).toEqual([
      "status --porcelain",
      "rev-list --count HEAD --not --remotes=origin",
      "push --set-upstream origin ada/proj-1239",
    ]);
  });
});
