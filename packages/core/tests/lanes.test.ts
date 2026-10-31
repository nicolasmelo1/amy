import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileLeases, HostServices, LEASE_WAIT, NodeCommandRunner, Plugin, WorkRecord, Worktree, WorktreeInfo, mount } from "../src/index.js";
import { PlannerRecord, TaskRecord, Work, mounted, planner, task, walk } from "./forks.js";

/**
 * Real repositories, because every claim here is about what git does to a
 * branch when two lanes reach for it: a scripted runner would only prove the
 * script.
 */
describe("lanes hold what they use", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;
  let host: HostServices;

  beforeEach(() => {
    // A hook running this suite exports GIT_INDEX_FILE and friends; these
    // repositories must use their own.
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lanes-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    run(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    run(root, "clone", "-q", bare, checkout);
    // The machine commits as whoever the checkout says; a CI runner has nobody configured.
    run(checkout, "config", "user.email", "amy@example.test");
    run(checkout, "config", "user.name", "amy");
    commit(checkout, "the first commit");
    run(checkout, "push", "-q", "origin", "main");
    host = {
      runner: new NodeCommandRunner(),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      paths: { workspace: path.join(root, "checkouts"), checkouts: {}, state: path.join(root, "state") },
    };
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The worktree port, as small as a test can make it honestly: one detached tree per work id. */
  function trees(): Plugin {
    const held = new Map<string, WorktreeInfo>();
    const pathFor = (workId: string, repo: string) => path.join(root, "trees", workId.replace(/[^A-Za-z0-9._-]+/g, "-"), repo.replace("/", "-"));
    const worktree: Worktree = {
      pathFor,
      acquire: async (workId, repo) => {
        const tree = pathFor(workId, repo);
        if (!fs.existsSync(tree)) {
          run(checkout, "worktree", "add", "-q", "--detach", tree, "main");
          held.set(tree, { workId, repo, workflow: "planner", path: tree, state: "in-flight", clean: true, branch: "", acquiredAt: "", updatedAt: "", retentionEligible: false, prunable: false });
        }
        return tree;
      },
      states: async () => [...held.values()],
      release: async (workId, repo) => {
        const tree = pathFor(workId, repo);
        run(checkout, "worktree", "remove", "--force", tree);
        return held.delete(tree);
      },
      prune: async () => [],
    };
    return { name: "trees", register: (registry) => registry.port("worktree", worktree) };
  }

  it("never puts two lanes in one worktree", async () => {
    const seen: string[] = [];
    const work: Work = async (scope, record) => {
      seen.push(await scope.checkouts.git.acquire("acme/widgets", record.id));
    };
    const { workflow, runtime } = await mounted([trees(), planner({ callee: task({ work }) })], host);

    const { record } = await walk(workflow, runtime, runtime.newRecord("PLAN-1", host.now()), host.now());

    expect(record.state).toBe("INTEGRATED");
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(seen.every((tree) => path.dirname(path.dirname(tree)) === path.join(root, "trees"))).toBe(true);
  });

  it("takes back the trees lent to lanes a record left running, when it leaves their fork other than through the join", async () => {
    let escalated = false;
    const work: Work = async (scope, record) => {
      await scope.checkouts.git.acquire("acme/widgets", record.id);
    };
    const { workflow, runtime } = await mounted([trees(), planner({ callee: task({ looks: 3, work }), escalated: () => escalated })], host);
    const forked = await walk(workflow, runtime, runtime.newRecord("PLAN-1", host.now()), host.now(), (current) =>
      current.state === "split" && Object.values(current.calls ?? {}).every((child) => ((child as TaskRecord).worked ?? 0) >= 1));
    const lent = () => fs.readdirSync(path.join(root, "trees")).filter((name) => fs.existsSync(path.join(root, "trees", name, "acme-widgets")));
    expect(lent()).toHaveLength(3);

    escalated = true;
    const { record } = await walk(workflow, runtime, forked.record, host.now());

    expect(record.state).toBe("ESCALATED");
    expect(lent()).toEqual([]);
  });

  it("gives a branch another lane holds to the second lane only once the first has ended, and the wait costs it no attempt", async () => {
    // Both lanes learn their branch only when they run, from their own task.
    const work: Work = async (scope, record) => {
      await scope.checkouts.git.prepareBranch("acme/widgets", `amy/${record.input.task.split(":")[0]}`, record.id);
      fs.writeFileSync(path.join(scope.checkouts.git.pathFor("acme/widgets", record.id), `${record.input.task.replace(/\W/g, "-")}.md`), "work\n");
      await scope.checkouts.git.commitAndPush("acme/widgets", `amy/${record.input.task.split(":")[0]}`, record.input.task, record.id);
    };
    const { workflow, runtime } = await mounted([trees(), planner({ lanes: ["TASK_A", "TASK_B"], callee: task({ looks: 2, work }) })], host);
    const start = { ...runtime.newRecord("PLAN-1", host.now()), tasks: ["shared:first", "shared:second"] } as PlannerRecord;

    const walked = await walk(workflow, runtime, start, host.now());

    const waited = walked.outcomes.findIndex((outcomes) => outcomes[LEASE_WAIT] !== undefined);
    expect(waited).toBeGreaterThan(-1);
    expect(walked.outcomes[waited]![LEASE_WAIT]).toMatchObject({ notATry: true, held: expect.stringMatching(/amy\/shared in acme\/widgets is held by PLAN-1\/TASK_A#1/) });
    const record = walked.record;
    expect(record.state).toBe("INTEGRATED");
    const second = record.calls!["PLAN-1/TASK_B#1"] as TaskRecord;
    // Two tries spent, and a look for every time it waited on the branch.
    const waits = walked.outcomes.filter((outcomes) => outcomes[LEASE_WAIT] !== undefined).length;
    expect(second.attempts.WORKING).toBe(2);
    expect(second.looks?.WORKING).toBe(2 + waits);
    // The first lane had ended before the second took the branch: its commits come first.
    expect(run(bare, "log", "--format=%s", "amy/shared").split("\n")).toEqual(["shared:second", "shared:first", "the first commit"]);
  });

  it("refuses at boot two lanes of one fork bound to the same literal branch, and only that", async () => {
    const same = await mount([trees(), planner({ lanes: ["TASK_A", "TASK_B"], branch: () => "amy/shared" })], {}, host);
    const different = await mount([trees(), planner({ lanes: ["TASK_A", "TASK_B"], branch: (lane) => `amy/${lane.toLowerCase()}` })], {}, host);
    const unnamed = await mount([trees(), planner({ lanes: ["TASK_A", "TASK_B"] })], {}, host);

    expect(same.ok ? "" : same.problems.join("; ")).toMatch(/planner → split: `TASK_A` and `TASK_B` both write the branch `amy\/shared`/);
    expect(different.ok).toBe(true);
    expect(unnamed.ok).toBe(true);
  });

  it("lends a lane bound with `revision` a tree detached at that commit, whatever it asks for, and it cannot move the caller's branch", async () => {
    run(checkout, "checkout", "-q", "-b", "amy/feature");
    const caller = commit(checkout, "the caller's change");
    run(checkout, "push", "-q", "origin", "amy/feature");
    const checked: { head: string; branch: string; moved: string[] }[] = [];
    const work: Work = async (scope, record) => {
      const git = scope.checkouts.git;
      // The lane asks for its tree as any piece of work would; the host lends it at the commit.
      const tree = await git.acquire("acme/widgets", record.id);
      const moved: string[] = [];
      for (const attempt of [
        () => git.prepareBranch("acme/widgets", "amy/feature", record.id),
        () => git.commitAndPush("acme/widgets", "amy/feature", "a lane's own change", record.id),
        () => git.push("acme/widgets", "amy/feature", record.id),
        // Its caller's work, and the standing checkout, are not its to move either.
        () => git.commitAndPush("acme/widgets", "amy/feature", "a lane's own change", "PLAN-1"),
        () => git.prepareBranch("acme/widgets", "amy/feature"),
      ]) {
        await attempt().then(() => moved.push("moved"), (error: Error) => moved.push(error.message));
      }
      checked.push({ head: run(tree, "rev-parse", "HEAD"), branch: run(tree, "branch", "--show-current"), moved });
    };
    const { workflow, runtime } = await mounted([trees(), planner({ lanes: ["TASK_A", "TASK_B"], revision: true, callee: task({ work }) })], host);
    const start = { ...runtime.newRecord("PLAN-1", host.now()), commit: caller } as PlannerRecord;

    const { record } = await walk(workflow, runtime, start, host.now());

    expect(record.state).toBe("INTEGRATED");
    expect((record.calls!["PLAN-1/TASK_A#1"] as WorkRecord).revision).toBe(caller);
    expect(checked).toHaveLength(2);
    for (const lane of checked) {
      expect(lane.head).toBe(caller);
      expect(lane.branch).toBe("");
      expect(lane.moved).toHaveLength(5);
      for (const said of lane.moved.slice(0, 3)) expect(said).toMatch(/was lent [0-9a-f]{7} to check, and checks it read-only: it cannot move/);
      expect(lane.moved[3]).toMatch(/PLAN-1\/TASK_[AB]#1 is a lane, and moves only its own work: it cannot move a branch in acme\/widgets as PLAN-1$/);
      expect(lane.moved[4]).toMatch(/is a lane, and moves only its own work: it cannot move amy\/feature in acme\/widgets as the standing checkout$/);
    }
    expect(run(bare, "rev-parse", "refs/heads/amy/feature")).toBe(caller);
    expect(run(checkout, "rev-parse", "amy/feature")).toBe(caller);
    // The trees go back once the lanes have met.
    expect(fs.readdirSync(path.join(root, "trees")).filter((name) => fs.existsSync(path.join(root, "trees", name, "acme-widgets")))).toEqual([]);
  });
});

function run(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(cwd: string, message: string): string {
  fs.writeFileSync(path.join(cwd, `${message.replace(/\W/g, "-")}.md`), `${message}\n`);
  run(cwd, "add", "-A");
  run(cwd, "-c", "user.name=amy", "-c", "user.email=amy@example.test", "commit", "-q", "-m", message);
  return run(cwd, "rev-parse", "HEAD");
}

describe("a lane that waits on a branch, on its way out", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;
  let host: HostServices;

  beforeEach(() => {
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lanes-out-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    run(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    run(root, "clone", "-q", bare, checkout);
    // The machine commits as whoever the checkout says; a CI runner has nobody configured.
    run(checkout, "config", "user.email", "amy@example.test");
    run(checkout, "config", "user.name", "amy");
    commit(checkout, "the first commit");
    run(checkout, "push", "-q", "origin", "main");
    host = {
      runner: new NodeCommandRunner(),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      paths: { workspace: path.join(root, "checkouts"), checkouts: {}, state: path.join(root, "state") },
    };
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("stays where it is rather than ending without the work its move carried", async () => {
    // Shared checkout: no worktree, so the lanes' work lands on one branch in turn.
    const work: Work = async (scope, record) => {
      await scope.checkouts.git.prepareBranch("acme/widgets", "amy/shared", record.id);
      fs.writeFileSync(path.join(checkout, `${record.input.task}-${record.worked ?? 0}.md`), "work\n");
      await scope.checkouts.git.commitAndPush("acme/widgets", "amy/shared", `${record.input.task} ${record.worked ?? 0}`, record.id);
    };
    const { workflow, runtime } = await mounted([planner({ lanes: ["TASK_A", "TASK_B"], callee: task({ looks: (name) => (name === "first" ? 1 : 0), finishWorking: true, work }) })], host);
    const start = { ...runtime.newRecord("PLAN-1", host.now()), tasks: ["first", "second"] } as PlannerRecord;

    const walked = await walk(workflow, runtime, start, host.now());

    expect(walked.outcomes.some((outcomes) => outcomes[LEASE_WAIT] !== undefined)).toBe(true);
    expect(walked.record.state).toBe("INTEGRATED");
    // The second lane's only move carries its work, and the first holds the
    // branch: it waited, and moved once the branch was free, work and all.
    expect(run(bare, "log", "--format=%s", "amy/shared").split("\n")).toEqual(["second 0", "first 1", "first 0", "the first commit"]);
  });
});

describe("lanes that share one checkout", () => {
  let root: string;
  let checkout: string;
  let bare: string;
  let saved: NodeJS.ProcessEnv;
  let host: HostServices;

  beforeEach(() => {
    saved = { ...process.env };
    for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lanes-shared-"));
    bare = path.join(root, "widgets.git");
    checkout = path.join(root, "checkouts", "widgets");
    run(root, "init", "-q", "--bare", "--initial-branch=main", bare);
    run(root, "clone", "-q", bare, checkout);
    // The machine commits as whoever the checkout says; a CI runner has nobody configured.
    run(checkout, "config", "user.email", "amy@example.test");
    run(checkout, "config", "user.name", "amy");
    commit(checkout, "the first commit");
    run(checkout, "push", "-q", "origin", "main");
    host = {
      runner: new NodeCommandRunner(),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      paths: { workspace: path.join(root, "checkouts"), checkouts: {}, state: path.join(root, "state") },
    };
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("take the checkout in turn, so one lane's commit never lands on another lane's branch", async () => {
    // One look gets onto the branch, the next commits there: a sibling that
    // switched the shared checkout in between would take the commit.
    const work: Work = async (scope, record) => {
      const branch = `amy/${record.input.task}`;
      if ((record.worked ?? 0) === 0) return void (await scope.checkouts.git.prepareBranch("acme/widgets", branch, record.id));
      fs.writeFileSync(path.join(checkout, `${record.input.task}.md`), "work\n");
      await scope.checkouts.git.commitAndPush("acme/widgets", branch, `${record.input.task}'s work`, record.id);
    };
    const { workflow, runtime } = await mounted([planner({ lanes: ["TASK_A", "TASK_B"], callee: task({ looks: 2, work }) })], host);
    const start = { ...runtime.newRecord("PLAN-1", host.now()), tasks: ["a", "b"] } as PlannerRecord;

    const walked = await walk(workflow, runtime, start, host.now());

    expect(walked.record.state).toBe("INTEGRATED");
    expect(walked.outcomes.some((outcomes) => outcomes[LEASE_WAIT] !== undefined)).toBe(true);
    expect(run(bare, "log", "--format=%s", "amy/a").split("\n")).toEqual(["a's work", "the first commit"]);
    expect(run(bare, "log", "--format=%s", "amy/b").split("\n")).toEqual(["b's work", "the first commit"]);
  });
});

describe("the branches a lane holds", () => {
  it("go back with the lane, those its own calls took included, and nobody else's", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-leases-"));
    const leases = new FileLeases(root);
    leases.take("acme/widgets", "amy/a", "PLAN-1/TASK_A#1");
    leases.take("acme/widgets", "amy/b", "PLAN-1/TASK_A#1/OPEN#1");
    leases.take("acme/widgets", "amy/c", "PLAN-1/TASK_AB#1");

    leases.release("PLAN-1/TASK_A#1");

    expect(leases.take("acme/widgets", "amy/a", "someone")).toEqual({ taken: true });
    expect(leases.take("acme/widgets", "amy/b", "someone")).toEqual({ taken: true });
    expect(leases.take("acme/widgets", "amy/c", "someone")).toEqual({ taken: false, holder: "PLAN-1/TASK_AB#1" });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("are one holder's for a lane and every call inside it, which never wait on each other", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-leases-"));
    const leases = new FileLeases(root);
    leases.take("acme/widgets", "amy/a", "PLAN-1/TASK_A#1");
    leases.take("acme/widgets", "amy/b", "PLAN-1/TASK_A#1/OPEN#1");

    expect(leases.take("acme/widgets", "amy/a", "PLAN-1/TASK_A#1/OPEN#1")).toEqual({ taken: true });
    expect(leases.take("acme/widgets", "amy/b", "PLAN-1/TASK_A#1")).toEqual({ taken: true });
    expect(leases.take("acme/widgets", "amy/a", "PLAN-1/TASK_B#1")).toEqual({ taken: false, holder: "PLAN-1/TASK_A#1" });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
