import { describe, it } from "vitest";
import { WorkflowRuntime } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { Task } from "../src/index.js";
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
  return { name, workId: "task-1", runtime, meanwhile: Array.from({ length: 4 }, () => done) };
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
