import { describe, it } from "vitest";
import { Harness, PullRequestView, Store, lendCheckouts } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { ScriptedRunner, fakeHost, fakeRun, pullRequest, whenArgsInclude } from "@amykit/test-fixtures";
import { DEFAULT_POLICY, ErrandRecord, Task, errandRuntime } from "../src/index.js";
import { newRecord, workflow as errand } from "./drawn.js";

const REPO = "acme/widgets";

/**
 * One errand's world: the tasks directory, the errands already in flight, an
 * agent that changes something, answers, or cannot get it done, and the code
 * host. One errand in flight finishes each time the machine waits.
 */
class ErrandWorld implements World {
  readonly meanwhile: (() => void)[];
  readonly workId: string;
  private readonly others: ErrandRecord[];
  private pr: PullRequestView | null = null;

  constructor(
    readonly name: string,
    private readonly task: Task,
    private readonly agent: "changes" | "answers" | "fails",
    inFlight = 0,
  ) {
    this.others = Array.from({ length: inFlight }, (_, index) => ({
      ...newRecord(`other-${index}`, new Date(task.addedAt)),
      state: "WORKING",
      repo: task.repo,
    }));
    this.workId = task.id;
    this.meanwhile = Array.from({ length: 4 }, () => () => this.oneIsDone());
  }

  runtime(now: () => Date) {
    const changes = this.agent === "changes";
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("status", "--porcelain"), result: { stdout: changes ? " M package.json\n" : "" } },
      { match: whenArgsInclude("push"), result: { stdout: changes ? "*\tHEAD:refs/heads/x\t[new branch]\nDone\n" : "Done\n" } },
    ]);
    const agent: Harness = {
      name: "relay",
      ask: async () => ({ text: "done", run: fakeRun(this.agent === "fails" ? { outcome: "failed", output: "it would not resolve" } : {}) }),
    };
    const records: Store<ErrandRecord> = { all: () => [...this.others], load: () => null, save: () => undefined };

    return { ...errandRuntime({
      tasks: { all: () => [this.task], get: (id) => (id === this.task.id ? this.task : null), add: () => this.task },
      agent,
      host: fakeHost(null, {
        findPullRequest: async () => this.pr,
        openPullRequest: async () => (this.pr = pullRequest({ number: 41 })).number,
      }),
      notifier: { announce: async () => {} },
      records,
      git: lendCheckouts(runner, { workspaceRoot: "/checkouts", defaultBranch: "main" }).git,
      layout: { workspaceRoot: "/checkouts", defaultBranch: "main" },
      now,
      config: { repos: [REPO] },
      policy: DEFAULT_POLICY,
    }), policy: DEFAULT_POLICY, newRecord };
  }

  private oneIsDone(): void {
    const working = this.others.find((other) => other.state === "WORKING");
    if (working) working.state = "DONE";
  }
}

const task = (repo: string): Task => ({
  id: "task-1",
  repo,
  text: "bump the stale deps in the api package",
  source: "ada, mid-conversation",
  addedAt: "2026-09-03T11:00:00.000Z",
});

describe("errand", () => {
  conforms(errand, {
    runner: { describe, it },
    runtime: (world, now) => world.runtime(now),
    worlds: [
      new ErrandWorld("an errand that changes something", task(REPO), "changes"),
      new ErrandWorld("an errand that was a question", task(REPO), "answers"),
      new ErrandWorld("an errand nobody can get done", task(REPO), "fails"),
      new ErrandWorld("an errand about somewhere errands are not done", task("acme/elsewhere"), "changes"),
      new ErrandWorld("an errand that arrives while three are in flight", task(REPO), "changes", 3),
    ],
    // Shipped, so every arrow its diagram draws is one some world walks.
    everyEdge: true,
  });
});
