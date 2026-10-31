import { describe, it, expect } from "vitest";
import { DEFAULT_POLICY } from "../src/observation.js";
import { Task } from "../src/ports/Tasks.js";
import { ErrandWorld, PULL_REQUEST_URL, walk } from "./mounted.js";

const TASK: Task = {
  id: "task-1",
  repo: "acme/widgets",
  text: "bump the stale deps in the api package",
  source: "ada, mid-conversation",
  addedAt: "2026-09-05T09:00:00.000Z",
};

// Walked through the mount, so `PR_OPEN` is the call it is when installed:
// the pull-request workflow takes its own looks inside it, and the errand
// moves on only once that workflow has reached an end.
async function walked(world = new ErrandWorld(TASK)) {
  return walk(await world.mounted(), TASK.id);
}

describe("an errand walking to a pull request", () => {
  it("reaches DONE, so no state is a dead end", async () => {
    expect((await walked()).record.state).toBe("DONE");
  });

  it("walks the lifecycle in order, the call's own looks inside PR_OPEN", async () => {
    const { looks } = await walked();

    expect(["QUEUED", ...looks.map((look) => look.to)]).toEqual([
      "QUEUED",
      "WORKING",
      "WORKING",
      "PR_OPEN",
      // The called workflow opens it, then finds it, then the errand returns.
      "PR_OPEN",
      "PR_OPEN",
      "DONE",
    ]);
  });

  it("makes at most one move per look", async () => {
    for (const look of (await walked()).looks) {
      expect(look.actions.length).toBeLessThanOrEqual(1);
    }
  });

  it("settles instead of spinning: driven past the end, nothing moves", async () => {
    const world = new ErrandWorld(TASK);
    const mounted = await world.mounted();
    const { record } = await walk(mounted, TASK.id);

    const after = mounted.workflow.plan(record, await mounted.runtime.observe(record), mounted.runtime.policy);
    expect(after.kind).toBe("settled");
  });

  it("opens the pull request that carries the change, by a call", async () => {
    const { record } = await walked();

    expect(record.pullRequestNumber).toBe(41);
    expect(record.calls?.["task-1/PR_OPEN#1"]?.state).toBe("OPENED");
  });
});

describe("an errand that was a question rather than a change", () => {
  function asked(): ErrandWorld {
    const world = new ErrandWorld(TASK);
    world.agentChangesSomething = false;
    return world;
  }

  it("is finished, not failed", async () => {
    // Half of what people say in passing is "check whether X". Treating a
    // clean tree as a failure would make this useless for all of it.
    const { record, looks } = await walked(asked());

    expect(record.state).toBe("DONE");
    expect(looks.map((look) => look.to)).toEqual(["WORKING", "WORKING", "DONE"]);
  });

  it("tells whoever asked what the answer was", async () => {
    const said = (await walked(asked())).looks.flatMap((look) => look.actions).filter((action) => action === "announce");

    expect(said).toHaveLength(1);
  });

  it("opens no pull request, because there is nothing to review", async () => {
    const world = asked();

    expect((await walked(world)).record.pullRequestNumber).toBeUndefined();
    expect(world.pullRequest).toBeNull();
    expect(world.opened).toEqual([]);
  });
});

describe("an errand that cannot be done", () => {
  it("is handed back when it is about a repository this install does not work in", async () => {
    const { record, looks } = await walked(new ErrandWorld(TASK, ["acme/elsewhere"]));

    expect(record.state).toBe("DECLINED");
    expect(looks[0]?.actions).toEqual(["announce"]);
  });

  it("is handed back after the attempts run out, saying what went wrong", async () => {
    const world = new ErrandWorld(TASK);
    world.agentSucceeds = false;

    const { record, looks } = await walked(world);

    expect(record.state).toBe("DECLINED");
    expect(record.attempts.WORKING).toBe(DEFAULT_POLICY.maxAttempts);
    expect(looks.at(-1)?.actions).toEqual(["announce"]);
  });

  it("is handed back after one attempt when the agent says it cannot be done, with its reason", async () => {
    // A refusal is a decision, not a failure: a second attempt would spend an
    // agent to hear the same answer.
    const world = new ErrandWorld(TASK);
    world.agentDeclines = "rewriting the ledger needs a decision nobody made";

    const { record, looks } = await walked(world);

    expect(DEFAULT_POLICY.maxAttempts).toBeGreaterThan(1);
    expect(record.state).toBe("DECLINED");
    expect(record.attempts.WORKING).toBe(1);
    expect(looks.at(-1)?.plan.why).toBe("the agent said it cannot be done as asked");
    expect(record.pullRequestNumber).toBeUndefined();
  });

  it("does not open a pull request for work that never got done", async () => {
    const world = new ErrandWorld(TASK);
    world.agentSucceeds = false;

    expect((await walked(world)).record.pullRequestNumber).toBeUndefined();
  });
});

describe("a pull request the code host refuses", () => {
  it("hands the errand back with the host's reason and the branch, said on the way out of the call", async () => {
    const world = new ErrandWorld(TASK);
    world.refusal = "Pull request creation is disabled for this repository";

    const { record, looks } = await walked(world);

    expect(record.state).toBe("DECLINED");
    expect(looks.map((look) => `${look.from}>${look.to}`)).toContain("PR_OPEN>DECLINED");
    const told = world.said.filter((text) => text.includes("Pull request creation is disabled"));
    expect(told).toHaveLength(1);
    expect(told[0]).toContain(TASK.text);
    expect(told[0]).toContain("amy/");
  });
});

describe("the ceiling on how many are in flight", () => {
  function crowded(): ErrandWorld {
    const world = new ErrandWorld(TASK);
    world.others = Array.from({ length: DEFAULT_POLICY.maxInFlight }, (_, index) => ({
      id: `other-${index}`, state: "WORKING", repo: TASK.repo, updatedAt: "", attempts: {}, history: [],
    }));
    return world;
  }

  it("holds rather than starting another", async () => {
    const { record, looks } = await walked(crowded());

    expect(record.state).toBe("QUEUED");
    expect(looks.at(-1)?.actions).toEqual(["announce"]);
  });

  it("says it once, not on every look", async () => {
    // The point of `amy btw` is that capturing costs nothing, so the ceiling
    // is reached often. A machine that said so every time would be the reason
    // somebody turns the notifications off.
    const world = crowded();
    const mounted = await world.mounted();
    let { record } = await walk(mounted, TASK.id);
    for (let look = 0; look < 3; look += 1) record = (await walk(mounted, TASK.id, record)).record;

    expect(world.said.filter((text) => text.includes("I am holding an errand"))).toHaveLength(1);
  });

  it("starts it once the pile clears", async () => {
    const world = crowded();
    const mounted = await world.mounted();
    const { record } = await walk(mounted, TASK.id);

    world.others = [];
    expect((await walk(mounted, TASK.id, record)).record.state).toBe("DONE");
  });
});

describe("what the errand says, and where it says it", () => {
  it("opens its pull request as a draft, because nobody asked for it", async () => {
    // Work somebody is waiting on is not a draft. An errand is something to
    // look at when you want to, and the state it opens in should say so.
    const world = new ErrandWorld(TASK);

    await walked(world);

    expect(world.opened.map((request) => request.draft)).toEqual([true]);
  });

  it("announces the link rather than the number", async () => {
    // Read on a phone more often than anywhere else, and a number is a thing
    // you have to go and look up.
    const world = new ErrandWorld(TASK);

    await walked(world);

    const told = world.said.find((text) => text.includes(PULL_REQUEST_URL));
    expect(told).toContain(TASK.text);
  });
});
