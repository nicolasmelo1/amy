import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isPlan, type Step } from "./held.js";

/**
 * The change a plan is judged in, read out of git.
 *
 * Against `origin/main` when this clone has it, since a local main can sit
 * behind it and make every merged commit look like part of the work; else
 * `main`. `PLANS_BASE` names another ref. Each commit since the merge-base is
 * a step, and the working tree's uncommitted changes are one more, so the
 * pre-commit hook judges the commit it is about to make.
 */
export interface Change {
  readonly base: string;
  readonly steps: Step[];
  readonly atBase: (file: string) => string | undefined;
  readonly baseFiles: ReadonlySet<string>;
}

export function readChange(root: string, env: NodeJS.ProcessEnv = process.env): Change {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const refs = env.PLANS_BASE ? [env.PLANS_BASE] : ["origin/main", "main"];
  const ref = refs.find((one) => {
    try {
      git("rev-parse", "--verify", "--quiet", `${one}^{commit}`);
      return true;
    } catch {
      return false;
    }
  });
  if (!ref) throw new Error(`no base to read the change against: tried ${refs.join(", ")}`);
  const base = git("merge-base", "HEAD", ref).trim();
  const show = (revision: string, file: string): string | undefined => {
    try {
      return git("show", `${revision}:${file}`);
    } catch {
      return undefined;
    }
  };

  const steps: Step[] = [];
  // A merge counts for what it changed against every parent — what its
  // resolution wrote — and not again for the commits it brought in.
  const commits = git("rev-list", "--reverse", "--parents", `${base}..HEAD`).split("\n").filter(Boolean).map((line) => line.split(" "));
  for (const [sha, ...parents] of commits) {
    const files = (parents.length > 1
      ? git("diff-tree", "--cc", "--no-commit-id", "--name-only", "-r", sha!)
      : git("diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", sha!)).split("\n").filter(Boolean);
    steps.push({ id: sha!.slice(0, 8), files, plans: new Map(files.filter(isPlan).map((file) => [file, show(sha!, file)])) });
  }

  const status = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames").split("\0").filter(Boolean);
  let pending = status.map((line) => line.slice(3));
  // A merge not yet committed counts, as a committed one does, for what
  // differs from both sides: not for everything the other side brought.
  const merging = (() => {
    try {
      return git("rev-parse", "--verify", "--quiet", "MERGE_HEAD").trim();
    } catch {
      return undefined;
    }
  })();
  if (merging) {
    const fromTheirs = new Set(git("diff", "--name-only", "--no-renames", merging).split("\n").filter(Boolean));
    const untracked = new Set(status.filter((line) => line.startsWith("??")).map((line) => line.slice(3)));
    pending = pending.filter((file) => fromTheirs.has(file) || untracked.has(file));
  }
  if (pending.length > 0) {
    const read = (file: string) => (fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : undefined);
    steps.push({ id: "the working tree", files: pending, plans: new Map(pending.filter(isPlan).map((file) => [file, read(file)])) });
  }

  return {
    base,
    steps,
    atBase: (file) => show(base, file),
    baseFiles: new Set(git("ls-tree", "-r", "--name-only", base).split("\n").filter(Boolean)),
  };
}
