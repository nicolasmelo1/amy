import { describe, it, expect } from "vitest";
import { Git } from "@amy/core";
import { ScriptedRunner, whenArgsInclude } from "@amy/test-fixtures";

const layout = { workspaceRoot: "/home/dev/workspaces/northwind", defaultBranch: "main" };

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

describe("Git.prepareBranch", () => {
  it("tracks the remote branch when it already exists", async () => {
    const runner = new ScriptedRunner();

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "ada/proj-1239");

    const checkout = runner.calls.find((call) => call.args[0] === "checkout");
    expect(checkout?.args).toEqual([
      "checkout",
      "-B",
      "ada/proj-1239",
      "origin/ada/proj-1239",
    ]);
  });

  it("cuts a new branch off the default when the remote has none", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("rev-parse", "refs/remotes/origin/"), result: { exitCode: 1 } },
    ]);

    await new Git(runner, layout).prepareBranch("Northwind/northwind-backend", "ada/proj-1239");

    const checkout = runner.calls.find((call) => call.args[0] === "checkout");
    expect(checkout?.args).toEqual(["checkout", "-B", "ada/proj-1239", "origin/main"]);
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
    expect(runner.calls.map((c) => c.args[0])).toEqual(["status"]);
  });
});
