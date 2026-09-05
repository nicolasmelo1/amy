import { describe, it, expect } from "vitest";
import { Plan } from "@amykit/core";
import { plan } from "../src/machine.js";
import { DEFAULT_POLICY, Observation, Policy } from "../src/observation.js";
import { PlanRecord, newRecord } from "../src/record.js";
import { PlanState } from "../src/state.js";
import { Note } from "../src/ports/Notes.js";

const NOW = new Date("2026-09-04T20:00:00.000Z");

const NOTE: Note = {
  id: "note-1",
  repo: "acme/widgets",
  text: "the gate output is truncated before the agent ever sees it",
  source: "somebody at a keyboard",
  writtenAt: "2026-09-04T19:00:00.000Z",
};

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    note: NOTE,
    writable: true,
    plansInFlight: 0,
    pullRequest: null,
    now: NOW,
    ...overrides,
  };
}

function record(state: PlanState, overrides: Partial<PlanRecord> = {}): PlanRecord {
  return { ...newRecord("note-1", NOW), state, repo: NOTE.repo, ...overrides };
}

const policy: Policy = DEFAULT_POLICY;

/** The action names a plan carries, which is what an assertion reads. */
function actions(decision: Plan): string[] {
  return decision.kind === "settled" ? [] : decision.effects.map((effect) => effect.type);
}

describe("NOTED", () => {
  it("starts drafting when the note is about a repository it may write into", () => {
    expect(plan(record("NOTED"), observation(), policy)).toMatchObject({
      kind: "advance",
      to: "DRAFTED",
    });
  });

  it("declines a note about anything else rather than writing into a fourth repository", () => {
    const decision = plan(record("NOTED"), observation({ writable: false }), policy);

    expect(decision).toMatchObject({ kind: "advance", to: "DECLINED" });
    expect(actions(decision)).toEqual(["announce"]);
  });

  it("hands the operator the note it declined, so it is not simply lost", () => {
    const decision = plan(record("NOTED"), observation({ writable: false }), policy);

    expect(decision.kind === "advance" && decision.effects[0]).toMatchObject({
      type: "announce",
      text: expect.stringContaining("the gate output is truncated"),
    });
  });

  it("holds past the ceiling rather than opening another nobody has read", () => {
    const decision = plan(record("NOTED"), observation({ plansInFlight: 2 }), policy);

    expect(decision).toMatchObject({ kind: "wait", retryAfterMs: policy.ceilingBackoffMs });
  });

  it("says so once at the ceiling, not on every look", () => {
    const first = plan(record("NOTED"), observation({ plansInFlight: 2 }), policy);
    const tenth = plan(
      record("NOTED", { attempts: { NOTED: 9 } }),
      observation({ plansInFlight: 2 }),
      policy,
    );

    expect(actions(first)).toEqual(["announce"]);
    expect(actions(tenth)).toEqual([]);
  });

  it("counts the ceiling before anything is drafted, so no agent is spent for nothing", () => {
    // The ceiling is reached at the first state, not at the pull request, so
    // a note that cannot land never reaches an agent at all.
    const decision = plan(record("NOTED"), observation({ plansInFlight: 5 }), policy);

    expect(actions(decision)).not.toContain("draft-plan");
  });
});

describe("DRAFTED", () => {
  it("asks the agent when nothing has been written yet", () => {
    const decision = plan(record("DRAFTED"), observation(), policy);

    expect(decision).toMatchObject({ kind: "act" });
    expect(actions(decision)).toEqual(["draft-plan"]);
  });

  it("carries no finding on the first attempt", () => {
    const decision = plan(record("DRAFTED"), observation(), policy);

    expect(decision.kind === "act" && decision.effects[0]).toEqual({
      type: "draft-plan",
      finding: undefined,
    });
  });

  it("moves to the check once a draft is on the remote", () => {
    const drafted = record("DRAFTED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
    });

    expect(plan(drafted, observation(), policy)).toMatchObject({
      kind: "advance",
      to: "CHECKED",
    });
  });

  it("sends the agent back with what the check said, verbatim", () => {
    const bounced = record("DRAFTED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
      lastCheck: {
        ok: false,
        output: "L4.PLAN_DECLARES_EXIT_CONDITION — no exit condition",
        at: "2026-09-04T20:05:00.000Z",
      },
    });

    expect(plan(bounced, observation(), policy).kind === "act").toBe(true);
    expect(plan(bounced, observation(), policy)).toMatchObject({
      effects: [{ type: "draft-plan", finding: "L4.PLAN_DECLARES_EXIT_CONDITION — no exit condition" }],
    });
  });

  it("does not take a draft older than the check as current", () => {
    // Without this the machine bounces to DRAFTED after a red check, finds the
    // previous successful draft still recorded, and returns to the check
    // forever. It is the same trap the ticket workflow has at IMPLEMENTING.
    const stale = record("DRAFTED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
      lastCheck: { ok: false, output: "red", at: "2026-09-04T20:05:00.000Z" },
    });

    expect(plan(stale, observation(), policy).kind).toBe("act");
  });

  it("gives up rather than spending an agent forever on a plan nothing accepts", () => {
    const exhausted = record("DRAFTED", {
      attempts: { DRAFTED: policy.maxDraftAttempts },
      lastCheck: { ok: false, output: "still red", at: "2026-09-04T20:05:00.000Z" },
    });

    expect(plan(exhausted, observation(), policy)).toMatchObject({
      kind: "advance",
      to: "DECLINED",
    });
  });

  it("tells the operator what the check kept saying when it gives up", () => {
    const exhausted = record("DRAFTED", {
      attempts: { DRAFTED: policy.maxDraftAttempts },
      lastCheck: { ok: false, output: "still red", at: "2026-09-04T20:05:00.000Z" },
    });
    const decision = plan(exhausted, observation(), policy);

    expect(decision.kind === "advance" && decision.effects[0]).toMatchObject({
      text: expect.stringContaining("still red"),
    });
  });
});

describe("CHECKED", () => {
  it("runs the repository's own check against the draft", () => {
    const drafted = record("CHECKED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
    });

    expect(actions(plan(drafted, observation(), policy))).toEqual(["check-plan"]);
  });

  it("opens a pull request once the check is green", () => {
    const green = record("CHECKED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
      lastCheck: { ok: true, output: "no findings", at: "2026-09-04T20:05:00.000Z" },
    });

    expect(plan(green, observation(), policy)).toMatchObject({ kind: "advance", to: "PR_OPEN" });
  });

  it("sends a red check back to the agent instead of to a pull request", () => {
    const red = record("CHECKED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
      lastCheck: { ok: false, output: "no exit condition", at: "2026-09-04T20:05:00.000Z" },
    });

    expect(plan(red, observation(), policy)).toMatchObject({ kind: "advance", to: "DRAFTED" });
  });

  it("carries no action back to the agent, so a retry is counted in one place", () => {
    const red = record("CHECKED", {
      lastDraft: { ok: true, output: "written", at: "2026-09-04T20:00:00.000Z" },
      lastCheck: { ok: false, output: "no exit condition", at: "2026-09-04T20:05:00.000Z" },
    });

    expect(actions(plan(red, observation(), policy))).toEqual([]);
  });
});

describe("PR_OPEN", () => {
  it("opens one when the branch has none", () => {
    expect(actions(plan(record("PR_OPEN"), observation(), policy))).toEqual([
      "open-pull-request",
    ]);
  });

  it("is done once the pull request exists, because merging it is not its call", () => {
    const seen = observation({
      pullRequest: {
        number: 12,
        url: "https://github.example.test/acme/widgets/pull/12",
        headSha: "abc",
        isDraft: false,
        changedFiles: 3,
        additions: 40,
        deletions: 12,
        reviewDecision: null,
        checks: { state: "passing", commitSha: "head" },
        mergeState: "mergeable",
        reviews: [],
        threads: [],
        requestedReviewers: [],
      },
    });

    expect(plan(record("PR_OPEN"), seen, policy)).toMatchObject({ kind: "advance", to: "DONE" });
  });
});

describe("the terminal states", () => {
  it("settles on DONE", () => {
    expect(plan(record("DONE"), observation(), policy).kind).toBe("settled");
  });

  it("settles on DECLINED, rather than retrying something no wait would fix", () => {
    expect(plan(record("DECLINED"), observation(), policy).kind).toBe("settled");
  });
});
