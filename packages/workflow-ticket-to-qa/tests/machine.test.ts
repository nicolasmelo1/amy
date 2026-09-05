import { describe, it, expect } from "vitest";
import { Plan } from "@amy/core";
import { plan } from "../src/machine.js";
import {
  HEAD,
  OLD_HEAD,
  WEEKEND,
  WORKDAY,
  botReview,
  botThread,
  observation,
  policy,
  pullRequest,
  record,
  review,
  roster,
  thread,
} from "@amy/test-fixtures";

function attempt(ok: boolean, at: string, output = ""): { ok: boolean; at: string; output: string } {
  return { ok, at, output };
}

/** Narrows a plan so a test can read the field it cares about. */
function expectAdvance(p: Plan): Extract<Plan, { kind: "advance" }> {
  expect(p.kind).toBe("advance");
  return p as Extract<Plan, { kind: "advance" }>;
}

function expectAct(p: Plan): Extract<Plan, { kind: "act" }> {
  expect(p.kind).toBe("act");
  return p as Extract<Plan, { kind: "act" }>;
}

function expectWait(p: Plan): Extract<Plan, { kind: "wait" }> {
  expect(p.kind).toBe("wait");
  return p as Extract<Plan, { kind: "wait" }>;
}

describe("DISCOVERED", () => {
  it("reads the ticket before doing anything else", () => {
    const p = expectAct(plan(record("DISCOVERED"), observation(), policy));

    expect(p.effects).toEqual([{ type: "triage" }]);
  });

  it("goes straight to work when the ticket is unambiguous", () => {
    const r = record("DISCOVERED", {
      triage: { clear: true, questions: [], at: "2026-09-03T10:00:00.000Z" },
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("READY");
  });

  it("posts the questions on the ticket when it is not", () => {
    const r = record("DISCOVERED", {
      triage: {
        clear: false,
        questions: ["Does write-off count towards the balance?"],
        at: "2026-09-03T10:00:00.000Z",
      },
    });

    const p = expectAdvance(plan(r, observation(), policy));

    expect(p.to).toBe("CLARIFYING");
    expect(p.effects).toEqual([
      { type: "ask-question", questions: ["Does write-off count towards the balance?"] },
    ]);
  });
});

describe("CLARIFYING", () => {
  it("holds while the question is unanswered", () => {
    const p = expectWait(plan(record("CLARIFYING"), observation(), policy));

    expect(p.retryAfterMs).toBe(policy.pollBackoffMs);
  });

  it("moves on once it is answered", () => {
    const obs = observation({ questionAnswered: true });

    expect(expectAdvance(plan(record("CLARIFYING"), obs, policy)).to).toBe("READY");
  });
});

describe("IMPLEMENTING", () => {
  it("asks the agent to implement", () => {
    const p = expectAct(plan(record("IMPLEMENTING"), observation(), policy));

    expect(p.effects).toEqual([{ type: "implement", retryContext: undefined }]);
  });

  it("feeds the previous failure back to the agent", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(false, "2026-09-03T10:00:00.000Z", "TypeError in invoice.ts"),
    });

    const p = expectAct(plan(r, observation(), policy));

    expect(p.effects).toEqual([
      { type: "implement", retryContext: "TypeError in invoice.ts" },
    ]);
  });

  it("hands a finished implementation to the gate", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("CHECKED");
  });

  it("does not trust an implementation that predates the last gate run", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "lint: 3 problems"),
    });

    const p = expectAct(plan(r, observation(), policy));

    expect(p.effects).toEqual([{ type: "implement", retryContext: "lint: 3 problems" }]);
  });

  it("escalates instead of retrying forever", () => {
    const r = record("IMPLEMENTING", {
      attempts: { IMPLEMENTING: policy.maxImplementAttempts },
      lastImplementation: attempt(false, "2026-09-03T10:00:00.000Z", "still broken"),
    });

    const p = expectAdvance(plan(r, observation(), policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.effects[0]).toMatchObject({ type: "escalate" });
  });
});

describe("CHECKED", () => {
  it("runs the gate against a fresh implementation", () => {
    const r = record("CHECKED", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
    });

    expect(expectAct(plan(r, observation(), policy)).effects).toEqual([{ type: "run-gate" }]);
  });

  it("opens the pull request on green", () => {
    const r = record("CHECKED", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(true, "2026-09-03T10:05:00.000Z"),
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("PR_OPEN");
  });

  it("sends a red gate back to the agent", () => {
    const r = record("CHECKED", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "typecheck failed"),
    });

    const p = expectAdvance(plan(r, observation(), policy));

    expect(p.to).toBe("IMPLEMENTING");
    // The retry context is picked up by IMPLEMENTING itself, so the bounce
    // carries no effect and the attempt is counted in exactly one place.
    expect(p.effects).toEqual([]);
  });

  it("escalates a gate that stays red", () => {
    const r = record("CHECKED", {
      attempts: { CHECKED: policy.maxGateAttempts },
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "typecheck failed"),
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("ESCALATED");
  });
});

describe("PR_OPEN", () => {
  it("opens the pull request when the branch has none", () => {
    const p = expectAct(plan(record("PR_OPEN"), observation(), policy));

    expect(p.effects).toEqual([{ type: "open-pull-request" }]);
  });

  it("moves on when one already exists", () => {
    const obs = observation({ pullRequest: pullRequest() });

    expect(expectAdvance(plan(record("PR_OPEN"), obs, policy)).to).toBe("COPILOT_WAIT");
  });
});

describe("COPILOT_WAIT", () => {
  it("waits until the automated reviewer has seen this head", () => {
    const obs = observation({ pullRequest: pullRequest({ reviews: [botReview(OLD_HEAD)] }) });

    expect(expectWait(plan(record("COPILOT_WAIT"), obs, policy)).why).toContain(
      HEAD.slice(0, 7),
    );
  });

  it("treats a review with nothing to say as a pass", () => {
    // The bot posts a COMMENTED review even when it found nothing, so an
    // empty review on the current head is the signal that it is finished.
    const obs = observation({ pullRequest: pullRequest({ reviews: [botReview()] }) });

    expect(expectAdvance(plan(record("COPILOT_WAIT"), obs, policy)).to).toBe(
      "REVIEWER_ASSIGNED",
    );
  });

  it("goes to fix when the bot left an unresolved thread", () => {
    const obs = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread()] }),
    });

    expect(expectAdvance(plan(record("COPILOT_WAIT"), obs, policy)).to).toBe("COPILOT_FIX");
  });

  it("ignores a resolved bot thread", () => {
    const obs = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [botThread({ isResolved: true })],
      }),
    });

    expect(expectAdvance(plan(record("COPILOT_WAIT"), obs, policy)).to).toBe(
      "REVIEWER_ASSIGNED",
    );
  });

  it("ignores a bot thread that was already judged", () => {
    const r = record("COPILOT_WAIT", {
      judged: [{ threadId: "B1", verdict: "fixed", note: "added the unique index" }],
    });
    const obs = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread()] }),
    });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("REVIEWER_ASSIGNED");
  });

  it("does not confuse a human thread for a bot one", () => {
    const obs = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [thread()] }),
    });

    expect(expectAdvance(plan(record("COPILOT_WAIT"), obs, policy)).to).toBe(
      "REVIEWER_ASSIGNED",
    );
  });

  it("falls back to opening a pull request if it vanished", () => {
    expect(expectAdvance(plan(record("COPILOT_WAIT"), observation(), policy)).to).toBe(
      "PR_OPEN",
    );
  });
});

describe("COPILOT_FIX", () => {
  it("addresses every unjudged bot thread at once", () => {
    const obs = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [botThread({ id: "B1" }), botThread({ id: "B2" })],
      }),
    });

    const p = expectAct(plan(record("COPILOT_FIX"), obs, policy));

    expect(p.effects).toEqual([
      { type: "address-threads", threadIds: ["B1", "B2"], from: "automated" },
    ]);
  });

  it("goes back to waiting once everything is judged", () => {
    const r = record("COPILOT_FIX", {
      judged: [{ threadId: "B1", verdict: "fixed", note: "done" }],
    });
    const obs = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread()] }),
    });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("COPILOT_WAIT");
  });
});

describe("REVIEWER_ASSIGNED", () => {
  it("picks the reviewer carrying the fewest open reviews", () => {
    const obs = observation({
      pullRequest: pullRequest(),
      reviewLoad: { "ada": 5, alan: 1, edsger: 3 },
    });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "alan" }]);
    expect(p.to).toBe("HUMAN_REVIEW");
  });

  it("counts a reviewer with no open reviews as empty rather than unknown", () => {
    const obs = observation({ reviewLoad: { "ada": 2, edsger: 1 } });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "alan" }]);
  });

  it("breaks a tie the same way every time", () => {
    const obs = observation({
      reviewLoad: { "ada": 1, alan: 1, edsger: 1 },
    });

    const first = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));
    const again = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(first.effects).toEqual([{ type: "assign-reviewer", host: "ada" }]);
    expect(again.effects).toEqual(first.effects);
  });

  it("skips anybody marked unavailable", () => {
    const obs = observation({
      roster: roster({
        confirmedOn: "2026-09-03",
        reviewers: [
          { tracker: "a@x", host: "alan", available: false },
          { tracker: "b@x", host: "edsger", available: true },
        ],
      }),
      reviewLoad: { alan: 0, edsger: 1 },
    });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "edsger" }]);
  });

  it("assigns nobody once every reviewer is at the open-review ceiling", () => {
    const obs = observation({
      pullRequest: pullRequest(),
      reviewLoad: { "ada": 2, alan: 2, edsger: 3 },
    });

    const p = expectWait(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    // The pull request stays open with nobody on it. The work is done; it is
    // somebody's attention that is being rationed.
    expect(p.effects).toEqual([
      {
        type: "announce",
        text: "PROJ-1239 has a pull request open and nobody assigned: every reviewer is at 2 open review(s).",
      },
    ]);
    expect(p.retryAfterMs).toBe(policy.pollBackoffMs);
  });

  it("assigns nobody at all when the ceiling is zero", () => {
    const obs = observation({ pullRequest: pullRequest(), reviewLoad: {} });

    const p = plan(record("REVIEWER_ASSIGNED"), obs, {
      ...policy,
      maxOpenReviewsPerReviewer: 0,
    });

    expect(p.kind).toBe("wait");
  });

  it("says nothing the second time it finds the ceiling reached", () => {
    const obs = observation({ reviewLoad: { "ada": 5, alan: 5, edsger: 5 } });

    const p = expectWait(
      plan(record("REVIEWER_ASSIGNED", { attempts: { REVIEWER_ASSIGNED: 1 } }), obs, policy),
    );

    expect(p.effects).toEqual([]);
  });

  it("assigns the emptiest reviewer while one is still under the ceiling", () => {
    const obs = observation({
      reviewLoad: { "ada": 4, alan: 1, edsger: 4 },
    });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "alan" }]);
  });

  it("refuses to assign on a workday when the roster is stale", () => {
    const obs = observation({ roster: roster({ confirmedOn: "2026-09-01" }), now: WORKDAY });

    const p = expectWait(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.retryAfterMs).toBe(policy.rosterBackoffMs);
    expect(p.effects[0]).toMatchObject({ type: "announce" });
  });

  it("asks only on the first look, so a stale roster does not spam", () => {
    const obs = observation({ roster: roster({ confirmedOn: "2026-09-01" }) });
    const later = record("REVIEWER_ASSIGNED", { attempts: { REVIEWER_ASSIGNED: 1 } });

    expect(expectWait(plan(later, obs, policy)).effects).toEqual([]);
  });

  it("does not need confirmation at the weekend", () => {
    const obs = observation({ roster: roster({ confirmedOn: "2026-09-01" }), now: WEEKEND });

    expect(expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy)).to).toBe(
      "HUMAN_REVIEW",
    );
  });

  it("holds when the whole roster is away", () => {
    const obs = observation({
      roster: roster({ reviewers: [{ tracker: "a@x", host: "edsger", available: false }] }),
    });

    expect(expectWait(plan(record("REVIEWER_ASSIGNED"), obs, policy)).why).toContain(
      "unavailable",
    );
  });
});

describe("HUMAN_REVIEW", () => {
  const assigned = { reviewer: "ada" };

  it("waits until the reviewer has looked at this head", () => {
    const obs = observation({
      pullRequest: pullRequest({ reviews: [review({ commitSha: OLD_HEAD })] }),
    });

    expect(expectWait(plan(record("HUMAN_REVIEW", assigned), obs, policy)).why).toContain(
      "ada",
    );
  });

  it("moves to approved when they approve", () => {
    const obs = observation({
      pullRequest: pullRequest({
        reviewDecision: "APPROVED",
        reviews: [review({ state: "APPROVED" })],
      }),
    });

    expect(expectAdvance(plan(record("HUMAN_REVIEW", assigned), obs, policy)).to).toBe(
      "APPROVED",
    );
  });

  it("goes to fix when they leave an open thread", () => {
    const obs = observation({
      pullRequest: pullRequest({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [review({ state: "CHANGES_REQUESTED" })],
        threads: [thread()],
      }),
    });

    expect(expectAdvance(plan(record("HUMAN_REVIEW", assigned), obs, policy)).to).toBe(
      "HUMAN_FIX",
    );
  });

  it("asks for a fresh review when changes were requested but everything is judged", () => {
    const r = record("HUMAN_REVIEW", {
      ...assigned,
      judged: [{ threadId: "T1", verdict: "fixed", note: "removed the alias" }],
    });
    const obs = observation({
      pullRequest: pullRequest({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [review({ state: "CHANGES_REQUESTED" })],
        threads: [thread()],
      }),
    });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("RE_REVIEW");
  });

  it("holds when the reviewer commented without deciding", () => {
    const obs = observation({ pullRequest: pullRequest({ reviews: [review()] }) });

    expect(expectWait(plan(record("HUMAN_REVIEW", assigned), obs, policy)).why).toContain(
      "without deciding",
    );
  });

  it("goes back to assignment when no reviewer is recorded", () => {
    const obs = observation({ pullRequest: pullRequest() });

    expect(expectAdvance(plan(record("HUMAN_REVIEW"), obs, policy)).to).toBe(
      "REVIEWER_ASSIGNED",
    );
  });
});

describe("HUMAN_FIX", () => {
  it("judges every open human thread", () => {
    const obs = observation({
      pullRequest: pullRequest({ threads: [thread({ id: "T1" }), thread({ id: "T2" })] }),
    });

    const p = expectAct(plan(record("HUMAN_FIX", { reviewer: "edsger" }), obs, policy));

    expect(p.effects).toEqual([
      { type: "address-threads", threadIds: ["T1", "T2"], from: "human" },
    ]);
  });

  it("asks for a fresh review when everything was fixed", () => {
    const r = record("HUMAN_FIX", {
      reviewer: "edsger",
      judged: [{ threadId: "T1", verdict: "fixed", note: "deleted it" }],
    });
    const obs = observation({ pullRequest: pullRequest({ threads: [thread()] }) });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("RE_REVIEW");
  });

  it("escalates rather than arguing with the reviewer", () => {
    const r = record("HUMAN_FIX", {
      reviewer: "edsger",
      judged: [{ threadId: "T1", verdict: "disagreed", note: "the types already prove this" }],
    });
    const obs = observation({ pullRequest: pullRequest({ threads: [thread()] }) });

    const p = expectAdvance(plan(r, obs, policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.effects[0]).toMatchObject({ type: "escalate", threadIds: ["T1"] });
  });

  it("does not escalate the same disagreement twice", () => {
    const r = record("HUMAN_FIX", {
      reviewer: "edsger",
      judged: [{ threadId: "T1", verdict: "disagreed", note: "n" }],
      escalation: { reason: "n", askedAt: "2026-09-03T10:00:00.000Z" },
    });
    const obs = observation({ pullRequest: pullRequest({ threads: [thread()] }) });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("RE_REVIEW");
  });
});

describe("ESCALATED", () => {
  it("holds until the owner answers", () => {
    expect(expectWait(plan(record("ESCALATED"), observation(), policy)).why).toContain("owner");
  });

  it("re-judges the comments once they do", () => {
    const obs = observation({ escalationAnswered: true });

    expect(expectAdvance(plan(record("ESCALATED"), obs, policy)).to).toBe("HUMAN_FIX");
  });
});

describe("RE_REVIEW", () => {
  it("asks the same reviewer to look again", () => {
    const p = expectAdvance(
      plan(record("RE_REVIEW", { reviewer: "edsger" }), observation(), policy),
    );

    expect(p.to).toBe("HUMAN_REVIEW");
    expect(p.effects).toEqual([{ type: "request-rereview", host: "edsger" }]);
  });
});

describe("QA_HANDOFF", () => {
  it("moves the ticket to the QA owner", () => {
    const p = expectAdvance(plan(record("QA_HANDOFF"), observation(), policy));

    expect(p.to).toBe("DONE");
    expect(p.effects).toEqual([
      { type: "hand-off-to-qa", tracker: "grace@example.test" },
    ]);
  });

  it("refuses on a workday when the roster is stale", () => {
    const obs = observation({ roster: roster({ confirmedOn: "2026-09-01" }) });

    expect(expectWait(plan(record("QA_HANDOFF"), obs, policy)).effects[0]).toMatchObject({
      type: "announce",
    });
  });

  it("holds when the QA owner is away", () => {
    const obs = observation({
      roster: roster({
        qa: { tracker: "grace@example.test", host: "grace", available: false },
      }),
    });

    expect(expectWait(plan(record("QA_HANDOFF"), obs, policy)).why).toContain("unavailable");
  });
});

describe("DONE", () => {
  it("is terminal", () => {
    expect(plan(record("DONE"), observation(), policy).kind).toBe("settled");
  });
});
