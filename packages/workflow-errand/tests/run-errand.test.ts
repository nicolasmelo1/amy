import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionContext, ActionHandler, CodeHost, Harness, NodeCommandRunner, Notifier, Store, lendCheckouts } from "@amykit/core";
import { errandRuntime } from "../src/actions.js";
import { DEFAULT_POLICY, Observation } from "../src/observation.js";
import { EffectOutcomes } from "../src/outcomes.js";
import { ErrandRecord } from "../src/record.js";
import { Task } from "../src/ports/Tasks.js";
import { branchFor, slugFor } from "../src/task-file.js";

const TASK: Task = {
  id: "T-1",
  repo: "acme/widgets",
  text: "bump the api version",
  source: "operator",
  addedAt: "2026-09-05T10:00:00.000Z",
};
const BRANCH = branchFor(slugFor(TASK));
const REFUSED = ["I cannot do that as asked.", JSON.stringify({ declined: "it needs a decision nobody made" })].join("\n");

/**
 * Real repositories, because the claim is about what reaches the origin: a
 * branch cut from main is a new ref there whether or not it carries a commit,
 * and only an errand that left something to review may publish one.
 */
describe("run-errand", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    // A hook running this suite exports GIT_INDEX_FILE and friends; these
    // repositories must use their own.
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-errand-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    git(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    git(root, "clone", "-q", bare, checkout);
    git(checkout, "config", "user.email", "amy@example.test");
    git(checkout, "config", "user.name", "amy");
    fs.writeFileSync(path.join(checkout, "README.md"), "widgets\n");
    git(checkout, "add", "-A");
    git(checkout, "commit", "-q", "-m", "the first commit");
    git(checkout, "push", "-q", "origin", "main");
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Runs the action once, with an agent that does whatever `work` does in the tree. */
  async function runErrand(work: (cwd: string) => void, said = "done", task: Task = TASK): Promise<EffectOutcomes> {
    const layout = { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" };
    const agent: Harness = {
      name: "stand-in",
      ask: async (_prompt, cwd) => {
        work(cwd);
        return {
          text: said,
          run: { outcome: "completed", harness: "stand-in", model: "none", costSource: "reported", durationMs: 1, output: said },
        };
      },
    } as Harness;
    const { git: checkoutGit } = lendCheckouts(new NodeCommandRunner(), layout);
    const runtime = errandRuntime({
      tasks: { add: () => task, all: () => [task], get: () => task },
      agent,
      host: {} as CodeHost,
      notifier: {} as Notifier,
      git: checkoutGit,
      layout,
      records: { all: () => [] } as unknown as Store<ErrandRecord>,
      now: () => new Date("2026-09-05T10:00:00.000Z"),
      config: { repos: [task.repo] },
      policy: DEFAULT_POLICY,
    });
    const outcomes: Record<string, unknown> = {};
    const context: ActionContext<ErrandRecord, Observation> = {
      record: { id: task.id, state: "WORKING", updatedAt: task.addedAt, attempts: {}, history: [] } as ErrandRecord,
      observation: { task, workable: true, inFlight: 0, pullRequest: null, now: new Date(task.addedAt) },
      outcomes,
    };
    const runErrandAction = runtime.actions?.["run-errand"] as ActionHandler<ErrandRecord, Observation>;
    await runErrandAction({ type: "run-errand" }, context);
    return outcomes as EffectOutcomes;
  }

  const onOrigin = (branch: string): boolean => {
    try {
      git(bare, "rev-parse", "--verify", `refs/heads/${branch}`);
      return true;
    } catch {
      return false;
    }
  };

  it("publishes the branch of an errand that changed something", async () => {
    const outcomes = await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "api.md"), "v2\n"));

    expect(outcomes.changed).toBe(true);
    expect(onOrigin(BRANCH)).toBe(true);
  });

  it("keeps the branch of an errand that only answered off the origin", async () => {
    const outcomes = await runErrand(() => {});

    expect(outcomes.changed).toBe(false);
    expect(outcomes.attempt?.ok).toBe(true);
    expect(onOrigin(BRANCH)).toBe(false);
  });

  it("publishes nothing for an errand the agent refused, whatever it left in the tree", async () => {
    const outcomes = await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "half.md"), "started\n"), [
      "I cannot do that as asked.",
      JSON.stringify({ declined: "it needs a decision nobody made" }),
    ].join("\n"));

    expect(outcomes.declined).toBe("it needs a decision nobody made");
    expect(outcomes.changed).toBeUndefined();
    expect(onOrigin(BRANCH)).toBe(false);
  });

  it("leaves a shared checkout clean for the next errand after a refusal", async () => {
    // With no worktree plugin every errand works in the one checkout, so what
    // a refusal left behind would otherwise be committed by the next errand.
    await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "half.md"), "started\n"), [
      "I cannot do that as asked.",
      JSON.stringify({ declined: "it needs a decision nobody made" }),
    ].join("\n"));
    const next: Task = { ...TASK, id: "T-2", text: "check whether the nightly sync still runs" };

    const outcomes = await runErrand(() => {}, "it still runs", next);

    expect(outcomes.changed).toBe(false);
    expect(onOrigin(branchFor(slugFor(next)))).toBe(false);
    expect(fs.existsSync(path.join(checkout, "half.md"))).toBe(false);
    expect(onOrigin(BRANCH)).toBe(false);
  });

  it("publishes nothing a refusal left for a later task whose branch has the same name", async () => {
    // The branch is named from the sentence, not the id, so a task worded the
    // same way lands on the refused task's branch.
    await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "half.md"), "started\n"), REFUSED);
    const same: Task = { ...TASK, id: "T-3" };

    const outcomes = await runErrand(() => {}, "it is already done", same);

    expect(branchFor(slugFor(same))).toBe(BRANCH);
    expect(outcomes.changed).toBe(false);
    expect(onOrigin(BRANCH)).toBe(false);
    expect(git(checkout, "stash", "list")).toContain("T-1");
  });

  it("declines and cleans the tree even when a commit hook would refuse what was left", async () => {
    const hook = path.join(checkout, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    const outcomes = await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "half.md"), "started\n"), REFUSED);

    expect(outcomes.declined).toBe("it needs a decision nobody made");
    expect(git(checkout, "status", "--porcelain")).toBe("");
  });

  it("publishes a commit an earlier attempt made and never pushed, even when this one changed nothing", async () => {
    await runErrand((cwd) => fs.writeFileSync(path.join(cwd, "api.md"), "v2\n"));
    git(bare, "branch", "-D", BRANCH);

    const outcomes = await runErrand(() => {});

    expect(outcomes.changed).toBe(true);
    expect(onOrigin(BRANCH)).toBe(true);
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
