import { describe, it, expect } from "vitest";
import { Plan, PullRequestView, actionsOf } from "@amy/core";
import { plan } from "../src/machine.js";
import { DEFAULT_POLICY, Observation } from "../src/observation.js";
import { EffectOutcomes, applyErrandPlan } from "../src/outcomes.js";
import { ErrandRecord, newRecord } from "../src/record.js";
import { ErrandState } from "../src/state.js";
import { Task } from "../src/ports/Tasks.js";

const NOW = new Date("2026-09-05T10:00:00.000Z");

const TASK: Task = {
  id: "task-1",
  repo: "acme/widgets",
  text: "bump the stale deps in the api package",
  source: "ada, mid-conversation",
  addedAt: "2026-09-05T09:00:00.000Z",
};

const PULL_REQUEST: PullRequestView = {
  number: 41,
  url: "https://github.example.test/acme/widgets/pull/41",
  headSha: "abc",
  isDraft: false,
  reviewDecision: null,
  reviews: [],
  threads: [],
  requestedReviewers: [],
};

/**
 * The world, as a thing the machine can only change by acting on it.
 *
 * The rule the other two walkthroughs keep is kept here: the world moves only
 * in response to an action, never on its own, so nothing passes because an
 * answer happened to be there before the question was asked.
 */
class World {
  pullRequest: PullRequestView | null = null;
  inFlight = 0;
  workable = true;
  /** Whether the agent gets it done at all. */
  agentSucceeds = true;
  /** Whether what it did left a change to push, or was only an answer. */
  agentChangesSomething = true;
  private clock = 0;

  observe(): Observation {
    return {
      task: TASK,
      workable: this.workable,
      inFlight: this.inFlight,
      pullRequest: this.pullRequest,
      now: NOW,
    };
  }

  perform(decision: Plan): EffectOutcomes {
    const outcomes: EffectOutcomes = {};

    for (const action of actionsOf(decision)) {
      this.clock += 1;
      const at = new Date(NOW.getTime() + this.clock * 1000).toISOString();

      if (action.type === "run-errand") {
        outcomes.attempt = this.agentSucceeds
          ? { ok: true, output: "raised four minor versions", at }
          : { ok: false, output: "the checkout would not resolve", at };
        if (this.agentSucceeds) outcomes.changed = this.agentChangesSomething;
      }
      if (action.type === "open-pull-request") {
        this.pullRequest = PULL_REQUEST;
        outcomes.pullRequestNumber = PULL_REQUEST.number;
      }
    }

    return outcomes;
  }
}

interface Move {
  from: ErrandState;
  to: ErrandState;
  actions: string[];
  why: string;
}

/** Drives the machine until it settles, or throws if it never does. */
function walk(world: World, limit = 40): { record: ErrandRecord; moves: Move[] } {
  let record = newRecord(TASK.id, NOW);
  const moves: Move[] = [];

  for (let step = 0; step < limit; step += 1) {
    const observation = world.observe();
    const decision = plan(record, observation, DEFAULT_POLICY);
    if (decision.kind === "settled") return { record, moves };

    const outcomes = world.perform(decision);
    const before = record.state;
    record = applyErrandPlan(record, decision, { ...outcomes }, observation, NOW);

    moves.push({
      from: before,
      to: record.state,
      actions: actionsOf(decision).map((a) => a.type),
      why: decision.why,
    });

    // A wait that changes nothing would spin forever here, and that is what
    // this loop is for: the ceiling is the only wait, and it is released by
    // the world rather than by another look.
    if (decision.kind === "wait") return { record, moves };
  }

  throw new Error(`the machine never settled: ${moves.map((m) => m.to).join(" -> ")}`);
}

describe("an errand walking to a pull request", () => {
  it("reaches DONE, so no state is a dead end", () => {
    expect(walk(new World()).record.state).toBe("DONE");
  });

  it("walks the lifecycle in order", () => {
    const { moves } = walk(new World());

    expect(["QUEUED", ...moves.map((move) => move.to)]).toEqual([
      "QUEUED",
      "WORKING",
      "WORKING",
      "PR_OPEN",
      "PR_OPEN",
      "DONE",
    ]);
  });

  it("makes at most one move per look", () => {
    for (const move of walk(new World()).moves) {
      expect(move.actions.length).toBeLessThanOrEqual(1);
    }
  });

  it("settles instead of spinning: driven past the end, nothing moves", () => {
    const world = new World();
    const { record } = walk(world);

    const after = plan(record, world.observe(), DEFAULT_POLICY);
    expect(after.kind).toBe("settled");
  });

  it("opens the pull request that carries the change", () => {
    expect(walk(new World()).record.pullRequestNumber).toBe(41);
  });
});

describe("an errand that was a question rather than a change", () => {
  it("is finished, not failed", () => {
    // Half of what people say in passing is "check whether X". Treating a
    // clean tree as a failure would make this useless for all of it.
    const world = new World();
    world.agentChangesSomething = false;

    const { record, moves } = walk(world);

    expect(record.state).toBe("DONE");
    expect(moves.map((move) => move.to)).toEqual(["WORKING", "WORKING", "DONE"]);
  });

  it("tells whoever asked what the answer was", () => {
    const world = new World();
    world.agentChangesSomething = false;

    const said = walk(world)
      .moves.flatMap((move) => move.actions)
      .filter((action) => action === "announce");

    expect(said).toHaveLength(1);
  });

  it("opens no pull request, because there is nothing to review", () => {
    const world = new World();
    world.agentChangesSomething = false;

    expect(walk(world).record.pullRequestNumber).toBeUndefined();
    expect(world.pullRequest).toBeNull();
  });
});

describe("an errand that cannot be done", () => {
  it("is handed back when it is about a repository this install does not work in", () => {
    const world = new World();
    world.workable = false;

    const { record, moves } = walk(world);

    expect(record.state).toBe("DECLINED");
    expect(moves[0]?.actions).toEqual(["announce"]);
  });

  it("is handed back after the attempts run out, saying what went wrong", () => {
    const world = new World();
    world.agentSucceeds = false;

    const { record, moves } = walk(world);

    expect(record.state).toBe("DECLINED");
    expect(record.attempts.WORKING).toBe(DEFAULT_POLICY.maxAttempts);
    expect(moves.at(-1)?.actions).toEqual(["announce"]);
  });

  it("does not open a pull request for work that never got done", () => {
    const world = new World();
    world.agentSucceeds = false;

    expect(walk(world).record.pullRequestNumber).toBeUndefined();
  });
});

describe("the ceiling on how many are in flight", () => {
  it("holds rather than starting another", () => {
    const world = new World();
    world.inFlight = DEFAULT_POLICY.maxInFlight;

    const { record, moves } = walk(world);

    expect(record.state).toBe("QUEUED");
    expect(moves.at(-1)?.actions).toEqual(["announce"]);
  });

  it("says it once, not on every look", () => {
    // The point of `amy btw` is that capturing costs nothing, so the ceiling
    // is reached often. A machine that said so every time would be the reason
    // somebody turns the notifications off.
    const world = new World();
    world.inFlight = DEFAULT_POLICY.maxInFlight;

    let record = newRecord(TASK.id, NOW);
    const said: string[] = [];

    for (let look = 0; look < 4; look += 1) {
      const decision = plan(record, world.observe(), DEFAULT_POLICY);
      said.push(...actionsOf(decision).map((action) => action.type));
      record = applyErrandPlan(record, decision, {}, world.observe(), NOW);
    }

    expect(said.filter((action) => action === "announce")).toHaveLength(1);
  });

  it("starts it once the pile clears", () => {
    const world = new World();
    world.inFlight = DEFAULT_POLICY.maxInFlight;
    walk(world);

    world.inFlight = 0;
    expect(walk(world).record.state).toBe("DONE");
  });
});

describe("what the errand says, and where it says it", () => {
  it("opens its pull request as a draft, because nobody asked for it", () => {
    // Work somebody is waiting on is not a draft. An errand is something to
    // look at when you want to, and the state it opens in should say so.
    const world = new World();
    const opened: boolean[] = [];

    let record = newRecord(TASK.id, NOW);
    for (let look = 0; look < 6; look += 1) {
      const decision = plan(record, world.observe(), DEFAULT_POLICY);
      if (decision.kind === "settled") break;
      for (const action of actionsOf(decision)) {
        if (action.type === "open-pull-request") opened.push(true);
      }
      record = applyErrandPlan(record, decision, world.perform(decision), world.observe(), NOW);
    }

    expect(opened).toEqual([true]);
  });

  it("announces the link rather than the number", () => {
    // Read on a phone more often than anywhere else, and a number is a thing
    // you have to go and look up.
    const world = new World();
    let record = newRecord(TASK.id, NOW);
    const said: string[] = [];

    for (let look = 0; look < 8; look += 1) {
      const decision = plan(record, world.observe(), DEFAULT_POLICY);
      if (decision.kind === "settled") break;
      for (const action of actionsOf(decision)) {
        if (action.type === "announce") said.push(String(action.text));
      }
      record = applyErrandPlan(record, decision, world.perform(decision), world.observe(), NOW);
    }

    expect(said.join("\n")).toContain(PULL_REQUEST.url);
  });
});
