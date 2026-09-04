import { describe, it, expect } from "vitest";
import { Plan, PullRequestView, actionsOf } from "@amy/core";
import { plan } from "../src/machine.js";
import { DEFAULT_POLICY, Observation } from "../src/observation.js";
import { EffectOutcomes, applyNotePlan } from "../src/outcomes.js";
import { PlanRecord, newRecord } from "../src/record.js";
import { PlanState } from "../src/state.js";
import { Note } from "../src/ports/Notes.js";

const NOW = new Date("2026-09-04T20:00:00.000Z");

const NOTE: Note = {
  id: "note-1",
  repo: "acme/widgets",
  text: "the gate output is truncated before the agent ever sees it",
  source: "a tick that failed in CHECKED",
  writtenAt: "2026-09-04T19:00:00.000Z",
};

const PULL_REQUEST: PullRequestView = {
  number: 12,
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
 * The rule the ticket workflow's walkthrough keeps is kept here too: the world
 * moves only in response to an action, never on its own, so nothing can pass
 * because an answer happened to be there before the question was asked.
 */
class World {
  pullRequest: PullRequestView | null = null;
  plansInFlight = 0;
  writable = true;
  /** What `sf check` says, once it is asked. */
  checkPasses = true;
  agentWrites = true;
  private clock = 0;

  observe(): Observation {
    return {
      note: NOTE,
      writable: this.writable,
      plansInFlight: this.plansInFlight,
      pullRequest: this.pullRequest,
      now: NOW,
    };
  }

  /** What the actions of one plan produced. */
  perform(decision: Plan): EffectOutcomes {
    const outcomes: EffectOutcomes = {};

    for (const action of actionsOf(decision)) {
      this.clock += 1;
      const at = new Date(NOW.getTime() + this.clock * 1000).toISOString();

      if (action.type === "draft-plan") {
        outcomes.draft = this.agentWrites
          ? { ok: true, output: "wrote plans/a-slug.md", at }
          : { ok: false, output: "changed no file", at };
      }
      if (action.type === "check-plan") {
        outcomes.check = this.checkPasses
          ? { ok: true, output: "no findings", at }
          : { ok: false, output: "L4.PLAN_DECLARES_EXIT_CONDITION", at };
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
  from: PlanState;
  to: PlanState;
  actions: string[];
  why: string;
}

/** Drives the machine until it settles, or throws if it never does. */
function walk(world: World, limit = 40): { record: PlanRecord; moves: Move[] } {
  let record = newRecord(NOTE.id, NOW);
  const moves: Move[] = [];

  for (let step = 0; step < limit; step += 1) {
    const observation = world.observe();
    const decision = plan(record, observation, DEFAULT_POLICY);
    if (decision.kind === "settled") return { record, moves };

    const outcomes = world.perform(decision);
    const before = record.state;
    record = applyNotePlan(record, decision, { ...outcomes }, NOW);

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

describe("a note walking to a pull request", () => {
  it("reaches DONE, so no state is a dead end", () => {
    expect(walk(new World()).record.state).toBe("DONE");
  });

  it("walks the lifecycle in order", () => {
    const { moves } = walk(new World());

    expect(["NOTED", ...moves.map((move) => move.to)]).toEqual([
      "NOTED",
      "DRAFTED",
      "DRAFTED",
      "CHECKED",
      "CHECKED",
      "PR_OPEN",
      "PR_OPEN",
      "DONE",
    ]);
  });

  it("makes at most one move per look", () => {
    const { moves } = walk(new World());

    for (const move of moves) {
      expect(move.actions.length).toBeLessThanOrEqual(1);
    }
  });

  it("reaches no pull request until the check is green", () => {
    const world = new World();
    const { moves } = walk(world);

    const opened = moves.findIndex((move) => move.actions.includes("open-pull-request"));
    const checked = moves.findIndex((move) => move.actions.includes("check-plan"));

    expect(checked).toBeGreaterThanOrEqual(0);
    expect(opened).toBeGreaterThan(checked);
  });

  it("touches no tracker on the way, because there is nothing to touch", () => {
    const { moves } = walk(new World());
    const everything = moves.flatMap((move) => move.actions);

    expect(everything).toEqual(["draft-plan", "check-plan", "open-pull-request"]);
  });
});

describe("a draft the repository refuses", () => {
  it("goes back to the agent rather than to a pull request", () => {
    const world = new World();
    world.checkPasses = false;

    const { moves } = walk(world);

    expect(moves.flatMap((move) => move.actions)).not.toContain("open-pull-request");
  });

  it("comes back green once the agent fixes what the check said", () => {
    const world = new World();
    world.checkPasses = false;

    let record = newRecord(NOTE.id, NOW);
    const seen: string[] = [];

    for (let step = 0; step < 20; step += 1) {
      const decision = plan(record, world.observe(), DEFAULT_POLICY);
      if (decision.kind === "settled") break;

      seen.push(...actionsOf(decision).map((a) => a.type));
      record = applyNotePlan(record, decision, world.perform(decision), NOW);

      // The agent gets it right on the second telling, which is what a
      // finding handed back is supposed to achieve. Flipped after the check
      // has already run once, so the red one genuinely happened.
      if (seen.filter((a) => a === "check-plan").length === 1) world.checkPasses = true;
    }

    expect(record.state).toBe("DONE");
    expect(seen.filter((action) => action === "draft-plan")).toHaveLength(2);
  });

  it("stops after the ceiling on attempts, rather than spending forever", () => {
    const world = new World();
    world.checkPasses = false;

    expect(walk(world).record.state).toBe("DECLINED");
  });
});

describe("a note the machine will not act on", () => {
  it("declines a repository it does not write into, having done nothing", () => {
    const world = new World();
    world.writable = false;

    const { record, moves } = walk(world);

    expect(record.state).toBe("DECLINED");
    expect(moves.flatMap((move) => move.actions)).toEqual(["announce"]);
  });

  it("holds at the ceiling with nothing drafted", () => {
    const world = new World();
    world.plansInFlight = DEFAULT_POLICY.maxOpenPlansPerRepo;

    const { record, moves } = walk(world);

    expect(record.state).toBe("NOTED");
    expect(moves.flatMap((move) => move.actions)).toEqual(["announce"]);
  });
});
