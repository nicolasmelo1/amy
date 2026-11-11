import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readChange } from "../history.js";

function repository(): { root: string; git: (...args: string[]) => string; write: (file: string, text: string) => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plans-history-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  write("src/a.ts", "export const a = 1;\n");
  write("plans/old.md", "---\ntouches: [src/a.ts]\n---\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  return { root, git, write };
}

describe("the change a plan is judged in", () => {
  it("is every commit since main, with the paths each touched and the plans as each left them, then the working tree", () => {
    const { root, git, write } = repository();
    git("checkout", "--quiet", "-b", "work");
    write("plans/x.md", "---\ntouches: [src/a.ts]\n---\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "groom");
    write("src/a.ts", "export const a = 2;\n");
    git("commit", "--quiet", "-am", "build");
    write("src/b.ts", "export const b = 1;\n");

    const change = readChange(root, {});

    expect(change.base).toBe(git("rev-parse", "main").trim());
    expect(change.steps.map((one) => one.files)).toEqual([["plans/x.md"], ["src/a.ts"], ["src/b.ts"]]);
    expect(change.steps[0]!.plans.get("plans/x.md")).toContain("touches");
    expect(change.steps.at(-1)!.id).toBe("the working tree");
    expect(change.atBase("plans/old.md")).toContain("touches");
    expect(change.atBase("plans/x.md")).toBeUndefined();
    expect([...change.baseFiles].sort()).toEqual(["plans/old.md", "src/a.ts"]);
  });

  it("reads against origin/main before a local main that may be behind it", () => {
    const { root, git, write } = repository();
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "--quiet", "-b", "work");
    write("src/a.ts", "export const a = 3;\n");
    git("commit", "--quiet", "-am", "work");
    git("checkout", "--quiet", "main");
    git("reset", "--quiet", "--hard", "HEAD");
    git("checkout", "--quiet", "work");

    expect(readChange(root, {}).steps.map((one) => one.id)).toHaveLength(1);
    expect(readChange(root, { PLANS_BASE: "work" }).steps).toEqual([]);
  });

  it("reads what a merge's resolution changed, and not the commits it brought in again", () => {
    const { root, git, write } = repository();
    git("checkout", "--quiet", "-b", "work");
    write("plans/x.md", "---\ntouches: [src/a.ts]\n---\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "groom");
    git("checkout", "--quiet", "-b", "side");
    write("src/a.ts", "export const a = 4;\n");
    git("commit", "--quiet", "-am", "side");
    git("checkout", "--quiet", "work");
    write("src/c.ts", "export const c = 1;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "build");
    git("merge", "--quiet", "--no-ff", "--no-commit", "side");
    // The resolution widens the plan, in the merge alone.
    write("plans/x.md", "---\ntouches: [src/a.ts, src/b.ts]\n---\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "merge side");

    const steps = readChange(root, {}).steps;

    expect(steps.map((one) => one.files)).toEqual([["plans/x.md"], ["src/a.ts"], ["src/c.ts"], ["plans/x.md"]]);
    expect(steps.at(-1)!.plans.get("plans/x.md")).toContain("src/b.ts");
  });

  it("reads a merge still in progress for what differs from both sides, not for what the other side brought", () => {
    const { root, git, write } = repository();
    git("checkout", "--quiet", "-b", "work");
    write("src/c.ts", "export const c = 1;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "build");
    git("checkout", "--quiet", "main");
    write("plans/old.md", "---\ntouches: [src/a.ts, src/b.ts]\n---\n");
    write("src/a.ts", "export const a = 5;\n");
    git("commit", "--quiet", "-am", "main moves on");
    git("checkout", "--quiet", "work");
    git("merge", "--quiet", "--no-ff", "--no-commit", "main");
    write("src/d.ts", "export const d = 1;\n");

    const steps = readChange(root, {}).steps;

    expect(steps.at(-1)!.id).toBe("the working tree");
    expect(steps.at(-1)!.files).toEqual(["src/d.ts"]);
  });

  it("says which refs it tried when none resolves", () => {
    const { root } = repository();
    expect(() => readChange(root, { PLANS_BASE: "nowhere" })).toThrow("no base to read the change against: tried nowhere");
  });

  it("finds the files holding a pattern at the base with one git grep, not what the change adds", () => {
    const { root, git, write } = repository();
    // A plugin no machine mounts: this repository holds no config at all.
    write("plugins/lonely/src/plugin.ts", 'const op = defineOperation({ cli: { words: ["lonely"] } });\n');
    git("add", ".");
    git("commit", "--quiet", "-m", "add a plugin no machine mounts");
    git("checkout", "--quiet", "-b", "work");
    // A file only the change holds never reaches the base the grep reads.
    write("plugins/added/src/plugin.ts", 'const op = defineOperation({ cli: { words: ["added"] } });\n');

    const change = readChange(root, {});

    expect(change.grepBase("cli: {")).toEqual(["plugins/lonely/src/plugin.ts"]);
    expect(change.grepBase("cli: {", [":(glob)plugins/*/src/**/*.ts"])).toEqual(["plugins/lonely/src/plugin.ts"]);
    expect(change.grepBase("nothing holds this")).toEqual([]);
  });
});
