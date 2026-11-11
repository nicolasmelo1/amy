import { describe, expect, it } from "vitest";
import { WorkflowRuntime } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { Task } from "../src/index.js";
import { runErrand } from "../src/actions.js";
import { ErrandWorld } from "./mounted.js";

const REPO = "acme/widgets";

const task = (repo: string): Task => ({
  id: "task-1",
  repo,
  text: "bump the stale deps in the api package",
  source: "ada, mid-conversation",
  addedAt: "2026-09-03T11:00:00.000Z",
});

/**
 * One errand's world, mounted the way the host mounts it, so `PR_OPEN` is the
 * call it is when installed. One errand in flight finishes each time the
 * machine waits.
 */
async function world(name: string, shape: (world: ErrandWorld) => void = () => undefined, repo = REPO, inFlight = 0): Promise<World & { runtime: WorkflowRuntime }> {
  const fake = new ErrandWorld(task(repo), [REPO]);
  shape(fake);
  fake.others = Array.from({ length: inFlight }, (_, index) => ({
    id: `other-${index}`, state: "WORKING", repo, updatedAt: "2026-09-03T11:00:00.000Z", attempts: {}, history: [],
  }));
  const done = (): void => {
    const working = fake.others.find((other) => other.state === "WORKING");
    if (working) working.state = "DONE";
  };
  const { runtime } = await fake.mounted();
  return { name, workId: "task-1", runtime, meanwhile: Array.from({ length: 4 }, () => done), again: () => world(name, shape, repo, inFlight) };
}

const worlds = [
  await world("an errand that changes something"),
  await world("an errand that was a question", (fake) => { fake.agentChangesSomething = false; }),
  await world("an errand nobody can get done", (fake) => { fake.agentSucceeds = false; }),
  await world("an errand about somewhere errands are not done", undefined, "acme/elsewhere"),
  await world("an errand that arrives while three are in flight", undefined, REPO, 3),
  await world("an errand whose pull request the code host refuses", (fake) => { fake.refusal = "Pull request creation is disabled"; }),
];

const { workflow } = await new ErrandWorld(task(REPO)).mounted();

describe("errand", () => {
  conforms(workflow, {
    runner: { describe, it },
    runtime: (current) => current.runtime,
    worlds,
    // Shipped, so every arrow its diagram draws is one some world walks.
    everyEdge: true,
  });
});

describe("an errand run as a lane of a fork", () => {
  it("works in the tree its own record holds, though it reads the unit's task", async () => {
    const trees: string[] = [];
    const held = (tree: string | undefined) => void trees.push(tree ?? "");
    const git = {
      prepareBranch: async (_repo: string, _branch: string, tree?: string) => held(tree),
      pathFor: (_repo: string, tree?: string) => (held(tree), `/trees/${tree}`),
      commit: async (_repo: string, _message: string, tree?: string) => (held(tree), true),
      commitsAhead: async () => 0,
      push: async (_repo: string, _branch: string, tree?: string) => held(tree),
    };
    let cwd = "";
    const scope = {
      checkouts: { git, layout: { workspaceRoot: "/checkouts", checkouts: {} } },
      ports: { agent: { ask: async (_prompt: string, at: string) => ((cwd = at), { text: "done", run: { outcome: "completed", output: "done" } }) } },
      ctx: { now: () => new Date("2026-09-05T10:00:00.000Z") },
    };

    await runErrand(scope as never, { record: { id: "task-1/WORK#1" }, observation: { task: task(REPO) }, outcomes: {} } as never, { type: "run-errand" } as never);

    expect([...new Set(trees)]).toEqual(["task-1/WORK#1"]);
    expect(cwd).toBe("/trees/task-1/WORK#1");
  });
});
