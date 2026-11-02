import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitBaseSource, NodeCommandRunner } from "@amykit/core";
import { NextStepsTracker } from "../src/index.js";

/**
 * Real repositories, because the claim is about what git answers: the base
 * branch on the remote, not the file somebody is editing in the checkout.
 */
describe("a row is read from the base branch", () => {
  let root: string;
  let author: string;
  let standing: string;
  let saved: NodeJS.ProcessEnv;

  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  const commit = (cwd: string, files: Record<string, string>, message: string) => {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), text);
    }
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", message);
    git(cwd, "push", "-q", "origin", "main");
  };

  beforeEach(() => {
    // A hook running this suite exports GIT_INDEX_FILE and friends; these
    // repositories must use their own.
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-next-steps-"));
    const bare = path.join(root, "widgets.git");
    author = path.join(root, "author");
    standing = path.join(root, "standing");
    git(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    git(root, "clone", "-q", bare, author);
    for (const [key, value] of [["user.email", "amy@example.test"], ["user.name", "amy"], ["commit.gpgsign", "false"]]) git(author, "config", key!, value!);
    commit(author, {
      "plans/next-steps.md": "| # | Work |\n| --- | --- |\n| 1 | [First](first.md) |\n| 2 | [Second](second.md) |\n",
      "plans/first.md": "# First\n",
      "plans/second.md": "# Second\n",
    }, "the order");
    git(root, "clone", "-q", bare, standing);
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const tracker = () =>
    new NextStepsTracker(
      new GitBaseSource(new NodeCommandRunner(), { workspaceRoot: root, checkouts: { "acme/widgets": standing }, defaultBranch: "main" }),
      { repo: "acme/widgets", table: "plans/next-steps.md", rows: 1, branchPrefix: "plan/" },
    );

  it("ignores an uncommitted row at the top of the standing checkout's table", async () => {
    fs.writeFileSync(
      path.join(standing, "plans/next-steps.md"),
      "| # | Work |\n| --- | --- |\n| 0 | [Half written](half-written.md) |\n| 1 | [First](first.md) |\n",
    );
    fs.writeFileSync(path.join(standing, "plans/half-written.md"), "# Half written\n");

    expect((await tracker().inProgress()).map((ticket) => ticket.id)).toEqual(["first"]);
    expect(await tracker().get("half-written")).toBeNull();
  });

  it("follows a reorder merged on the remote without anybody pulling the standing checkout", async () => {
    commit(author, { "plans/next-steps.md": "| # | Work |\n| --- | --- |\n| 1 | [Second](second.md) |\n| 2 | [First](first.md) |\n" }, "second first");

    expect((await tracker().inProgress()).map((ticket) => ticket.id)).toEqual(["second"]);
    expect(git(standing, "rev-parse", "HEAD")).not.toBe(git(author, "rev-parse", "HEAD"));
  });

  it("reads a row merged out of the table, its plan moved to docs/design/, as delivered", async () => {
    fs.mkdirSync(path.join(author, "docs/design"), { recursive: true });
    git(author, "mv", "plans/first.md", "docs/design/first.md");
    commit(author, { "plans/next-steps.md": "| # | Work |\n| --- | --- |\n| 1 | [Second](second.md) |\n" }, "first is delivered");

    expect(await tracker().get("first")).toMatchObject({ status: "delivered", repo: "acme/widgets" });
    expect((await tracker().inProgress()).map((ticket) => ticket.id)).toEqual(["second"]);
  });
});
