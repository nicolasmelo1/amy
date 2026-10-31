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
  async function runErrand(work: (cwd: string) => void): Promise<EffectOutcomes> {
    const layout = { workspaceRoot: path.join(root, "checkouts"), defaultBranch: "main" };
    const agent: Harness = {
      name: "stand-in",
      ask: async (_prompt, cwd) => {
        work(cwd);
        return {
          text: "done",
          run: { outcome: "completed", harness: "stand-in", model: "none", costSource: "reported", durationMs: 1, output: "done" },
        };
      },
    } as Harness;
    const { git: checkoutGit } = lendCheckouts(new NodeCommandRunner(), layout);
    const runtime = errandRuntime({
      tasks: { add: () => TASK, all: () => [TASK], get: () => TASK },
      agent,
      host: {} as CodeHost,
      notifier: {} as Notifier,
      git: checkoutGit,
      layout,
      records: { all: () => [] } as unknown as Store<ErrandRecord>,
      now: () => new Date("2026-09-05T10:00:00.000Z"),
      config: { repos: [TASK.repo] },
      policy: DEFAULT_POLICY,
    });
    const outcomes: Record<string, unknown> = {};
    const context: ActionContext<ErrandRecord, Observation> = {
      record: { id: TASK.id, state: "WORKING", updatedAt: TASK.addedAt, attempts: {}, history: [] } as ErrandRecord,
      observation: { task: TASK, workable: true, inFlight: 0, pullRequest: null, now: new Date(TASK.addedAt) },
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
