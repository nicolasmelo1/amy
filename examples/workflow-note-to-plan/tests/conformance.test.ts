import { describe, expect, it } from "vitest";
import { WorkflowRuntime } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { Note } from "../src/index.js";
import { checkPlan, draftPlan } from "../src/actions.js";
import { NoteWorld } from "./mounted.js";

const REPO = "acme/widgets";

const note = (repo: string): Note => ({
  id: "note-1",
  repo,
  text: "the gate output is truncated before the agent ever sees it",
  source: "a tick that failed in CHECKED",
  writtenAt: "2026-09-03T11:00:00.000Z",
});

/**
 * One note's world, mounted the way the host mounts it, so `PR_OPEN` is the
 * call it is when installed and the kit walks the pull-request workflow's
 * looks inside it.
 *
 * `inFlight` is how many other plans for the same repository are open when
 * the note arrives; one of them is merged each time the machine waits, which
 * is what somebody reading them looks like from here.
 */
async function world(name: string, shape: (world: NoteWorld) => void = () => undefined, repo = REPO, inFlight = 0): Promise<World & { runtime: WorkflowRuntime }> {
  const fake = new NoteWorld(note(repo), [REPO]);
  fake.redChecks = 1;
  shape(fake);
  fake.others = Array.from({ length: inFlight }, (_, index) => ({
    id: `other-${index}`, state: "PR_OPEN", repo, updatedAt: "2026-09-03T11:00:00.000Z", attempts: {}, history: [],
  }));
  const merged = (): void => {
    const open = fake.others.find((other) => other.state === "PR_OPEN");
    if (open) open.state = "DONE";
  };
  const { runtime } = await fake.mounted();
  return { name, workId: "note-1", runtime, meanwhile: Array.from({ length: 4 }, () => merged), again: () => world(name, shape, repo, inFlight) };
}

const worlds = [
  await world("a note about a repository plans are written into"),
  await world("a note about somewhere plans are not written", undefined, "acme/elsewhere"),
  await world("a note that arrives while two plans are unread", undefined, REPO, 2),
  await world("a note no draft of which gets past the check", (fake) => { fake.checkPasses = false; }),
  await world("a note whose pull request the code host refuses", (fake) => { fake.refusal = "No commits between main and the branch"; }),
];

const { workflow } = await new NoteWorld(note(REPO)).mounted();

describe("note-to-plan", () => {
  conforms(workflow, {
    runner: { describe, it },
    runtime: (current) => current.runtime,
    worlds,
    // Shipped, so every arrow its diagram draws is one some world walks.
    everyEdge: true,
  });
});

describe("a note drafted as a lane of a fork", () => {
  it("drafts and checks in the tree its own record holds, though it reads the unit's note", async () => {
    const trees: string[] = [];
    const held = (tree: string | undefined) => void trees.push(tree ?? "");
    const git = {
      prepareBranch: async (_repo: string, _branch: string, tree?: string) => held(tree),
      pathFor: (_repo: string, tree?: string) => (held(tree), `/trees/${tree}`),
      commitAndPush: async (_repo: string, _branch: string, _message: string, tree?: string) => (held(tree), true),
    };
    const scope = {
      checkouts: { git },
      ports: {
        agent: { ask: async () => ({ text: "drafted", run: { outcome: "completed", output: "drafted" } }) },
        "plan-check": { check: async (_repo: string, tree: string) => (held(tree), { ok: true, output: "", at: "" }) },
      },
      ctx: { now: () => new Date("2026-09-05T10:00:00.000Z") },
    };
    const work = { record: { id: "note-1/WORK#1" }, observation: { note: note(REPO) }, outcomes: {} };

    await draftPlan(scope as never, work as never, { type: "draft-plan" } as never);
    await checkPlan(scope as never, work as never);

    expect([...new Set(trees)]).toEqual(["note-1/WORK#1"]);
  });
});
