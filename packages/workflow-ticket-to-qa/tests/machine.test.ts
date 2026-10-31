import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AskContext, Budget, Conversation, HarnessReply, Plan, Reply, Tracker, dispatchesTo } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { Worker } from "@amykit/plugin-serial-engine";
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
  InMemoryStore,
  fakeAgent,
  fakeGit,
  fakeTracker,
  ticketWorkerDeps,
} from "@amykit/test-fixtures";

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
      triage: { clear: true, questions: [], askedQuestions: [], at: "2026-09-03T10:00:00.000Z" },
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("READY");
  });

  it("posts the questions on the ticket when it is not", () => {
    const r = record("DISCOVERED", {
      triage: {
        clear: false,
        questions: ["Does write-off count towards the balance?"],
        askedQuestions: ["Does write-off count towards the balance?"],
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
  const asked = {
    clear: false,
    questions: ["Which currency should the invoice total be shown in?"],
    askedQuestions: ["Which currency should the invoice total be shown in?"],
    at: "2026-09-03T10:00:00.000Z",
  };

  const amyAsked = {
    author: "amy",
    body: "- Which currency should the invoice total be shown in?",
    at: "2026-09-03T10:01:00.000Z",
    fromAmy: true,
  };
  const answered = {
    author: "ada",
    body: "In BRL, the same as the rest of the invoice.",
    at: "2026-09-03T12:00:00.000Z",
    fromAmy: false,
  };

  it("holds while the question is unanswered", () => {
    const p = expectWait(
      plan(record("CLARIFYING", { triage: asked }), observation(), policy),
    );

    expect(p.retryAfterMs).toBe(policy.pollBackoffMs);
    expect(p.why).toBe("waiting for an answer in the work thread");
  });

  it("re-reads the ticket once it is answered, with the answer attached", () => {
    const obs = observation({ conversation: [amyAsked, answered] });

    const p = expectAdvance(plan(record("CLARIFYING", { triage: asked }), obs, policy));

    expect(p.to).toBe("READY");
    expect(p.why).toBe("the question in the work thread was answered");
    expect(p.effects).toEqual([
      {
        type: "triage",
        conversation: [
          "You asked: - Which currency should the invoice total be shown in?",
          "ada answered: In BRL, the same as the rest of the invoice.",
        ],
      },
    ]);
  });

  it("does not read its own question, quoted back, as the answer", () => {
    // A tracker that copies the body into a reply, or a system that quotes
    // the thread, must not pass for an answer: only one line carries
    // "answered:", and it is the human's.
    const obs = observation({ conversation: [amyAsked] });

    const p = plan(record("CLARIFYING", { triage: asked }), obs, policy);

    expect(p.kind).toBe("wait");
  });

  it("never re-asks a question already answered", () => {
    const obs = observation({ conversation: [amyAsked, answered] });

    const p = plan(record("CLARIFYING", { triage: asked }), obs, policy);

    // The move is a re-read, not a question: no effect asks anything.
    expect(JSON.stringify((p as { effects?: { type: string }[] }).effects)).not.toContain(
      "ask-question",
    );
  });

  it("ignores its own comments even when the record forgot the questions", () => {
    // A record from a version before `askedQuestions` existed, or a hand-built
    // one: every amy comment is still labelled as its own, from the tracker's
    // `fromAmy`, not from the record's memory.
    const obs = observation({
      conversation: [
        amyAsked,
        { ...amyAsked, body: "anything else amy wrote" },
        answered,
      ],
    });

    const p = expectAdvance(plan(record("CLARIFYING", { triage: asked }), obs, policy));

    expect(p.effects[0]).toMatchObject({
      type: "triage",
      conversation: expect.arrayContaining([
        "You asked: - Which currency should the invoice total be shown in?",
        "You asked: anything else amy wrote",
        "ada answered: In BRL, the same as the rest of the invoice.",
      ]),
    });
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

  it("hands a finished implementation to both checks at once", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
    });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("checks");
  });

  it("does not trust an implementation that predates the last gate run", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "lint: 3 problems"),
    });

    const p = expectAct(plan(r, observation(), policy));

    expect(p.effects).toEqual([{ type: "implement", retryContext: "The gate said:\nlint: 3 problems" }]);
  });

  it("carries what both checks found in one round: the gate's refusal and the review beside it", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "lint: 3 problems"),
      lastSelfReview: { ...attempt(true, "2026-09-03T10:05:00.000Z", "the total rounds twice"), verdict: "APPROVED" },
    });

    const p = expectAct(plan(r, observation(), policy));

    expect(p.effects).toEqual([{ type: "implement", retryContext: "The gate said:\nlint: 3 problems\n\nThe review of the change said:\nthe total rounds twice" }]);
  });

  it("carries the review alone when only the review asked for changes", () => {
    const r = record("IMPLEMENTING", {
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(true, "2026-09-03T10:05:00.000Z"),
      lastSelfReview: { ...attempt(true, "2026-09-03T10:05:00.000Z", "CHANGES_ASKED: name the currency"), verdict: "CHANGES_ASKED" },
    });

    expect(expectAct(plan(r, observation(), policy)).effects).toEqual([
      { type: "implement", retryContext: "The review of the change said:\nCHANGES_ASKED: name the currency" },
    ]);
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

describe("verdict", () => {
  const met = (gate: "GREEN" | "RED", review: "APPROVED" | "CHANGES_ASKED") => ({
    GATE: { call: "PROJ-1239/GATE#1", end: gate },
    SELF_REVIEW: { call: "PROJ-1239/SELF_REVIEW#1", end: review },
  });

  it("opens the pull request when the gate is green and the review found nothing", () => {
    const r = record("verdict", { lanes: met("GREEN", "APPROVED") });

    expect(expectAdvance(plan(r, observation(), policy)).to).toBe("PR_OPEN");
  });

  it.each([
    ["the gate is red", "RED", "APPROVED"],
    ["the review asked for changes", "GREEN", "CHANGES_ASKED"],
    ["the gate is red and the review asked for changes", "RED", "CHANGES_ASKED"],
  ] as const)("sends the work back to the agent when %s", (said, gate, review) => {
    const r = record("verdict", { attempts: { verdict: 1 }, lanes: met(gate, review) });

    const p = expectAdvance(plan(r, observation(), policy));

    expect(p.to).toBe("IMPLEMENTING");
    expect(p.why).toContain(said);
    // The retry context is picked up by IMPLEMENTING itself, so the bounce
    // carries no effect and the attempt is counted in exactly one place.
    expect(p.effects).toEqual([]);
  });

  it("escalates checks that keep finding something", () => {
    const r = record("verdict", {
      attempts: { verdict: policy.maxGateAttempts },
      lanes: met("RED", "APPROVED"),
      lastImplementation: attempt(true, "2026-09-03T10:00:00.000Z"),
      lastGate: attempt(false, "2026-09-03T10:05:00.000Z", "typecheck failed"),
    });

    const p = expectAdvance(plan(r, observation(), policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.effects[0]).toMatchObject({ type: "escalate", reason: expect.stringContaining("typecheck failed") });
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

  it("closes a thread the fix already answered, in one act", () => {
    const r = record("COPILOT_FIX", {
      judged: [{ threadId: "B1", verdict: "fixed", note: "added the unique index" }],
    });
    const obs = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread({ id: "B1" })] }),
    });

    const p = expectAct(plan(r, obs, policy));

    expect(p.why).toContain("closing");
    expect(p.effects).toEqual([{ type: "resolve-review-thread", threadId: "B1" }]);
  });

  it("closes every answered thread in one look, and nothing it never judged", () => {
    const r = record("COPILOT_FIX", {
      judged: [
        { threadId: "B1", verdict: "fixed", note: "added the unique index" },
        { threadId: "B2", verdict: "fixed", note: "inlined it" },
      ],
    });
    const obs = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [botThread({ id: "B1" }), botThread({ id: "B2" }), botThread({ id: "B3" })],
      }),
    });

    const p = expectAct(plan(r, obs, policy));

    // One act each, and B3 — never answered — is left for the agent.
    expect(p.effects).toEqual([
      { type: "resolve-review-thread", threadId: "B1" },
      { type: "resolve-review-thread", threadId: "B2" },
    ]);
  });

  it("never closes a colleague's thread, however it was judged", () => {
    // A human thread judged `fixed` means the code changed in answer to a
    // person — settling it is the person's call, not the machine's. Only the
    // bot's unanswered thread is worth an agent.
    const r = record("COPILOT_FIX", {
      judged: [{ threadId: "T1", verdict: "fixed", note: "removed the alias" }],
    });
    const obs = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [thread({ id: "T1" }), botThread({ id: "B1" })],
      }),
    });

    const p = expectAct(plan(r, obs, policy));

    expect(p.effects).toEqual([
      { type: "address-threads", threadIds: ["B1"], from: "automated" },
    ]);
  });

  it("does not close a thread the record only disagreed with", () => {
    // A disagreement parks for the owner; the forge's button is not this
    // machine's to press while the objection stands. The unjudged sibling is
    // still work for the agent.
    const r = record("COPILOT_FIX", {
      judged: [{ threadId: "B1", verdict: "disagreed", note: "the types already prove this" }],
    });
    const obs = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [botThread({ id: "B1" }), botThread({ id: "B2" })],
      }),
    });

    const p = expectAct(plan(r, obs, policy));

    expect(p.effects).toEqual([
      { type: "address-threads", threadIds: ["B2"], from: "automated" },
    ]);
  });

  it("closes a thread it answered and sees it closed on the next look", () => {
    // The two-look dance the port's write makes possible: the first look
    // closes what the fix answered, the second finds nothing open and leaves
    // the way the exit condition reads — not because attempts ran out.
    const judged = [{ threadId: "B1", verdict: "fixed" as const, note: "added the unique index" }];

    const firstLook = observation({
      pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread({ id: "B1" })] }),
    });
    const closeIt = expectAct(plan(record("COPILOT_FIX", { judged }), firstLook, policy));
    expect(closeIt.effects).toEqual([{ type: "resolve-review-thread", threadId: "B1" }]);

    const secondLook = observation({
      pullRequest: pullRequest({
        reviews: [botReview()],
        threads: [botThread({ id: "B1", isResolved: true })],
      }),
    });
    expect(expectAdvance(plan(record("COPILOT_FIX", { judged }), secondLook, policy)).to).toBe(
      "COPILOT_WAIT",
    );
  });
});

describe("a change too large to hand to an agent", () => {
  const huge = { changedFiles: 500, additions: 19_000, deletions: 1_000 };

  it("hands a five-hundred-file review back instead of spending an agent", () => {
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    const p = expectAdvance(plan(record("COPILOT_FIX"), obs, policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.effects.map((effect) => effect.type)).toEqual(["escalate"]);
  });

  it("says which ceiling was passed and by how much", () => {
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    const p = expectAdvance(plan(record("COPILOT_FIX"), obs, policy));

    expect(p.why).toContain("500 files changed");
    expect(p.why).toContain(String(policy.maxPullRequestFiles));
  });

  it("counts both sides of the diff, so a rewrite of one file still counts", () => {
    const obs = observation({
      pullRequest: pullRequest({
        changedFiles: 1,
        additions: 1_500,
        deletions: 1_400,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    expect(expectAdvance(plan(record("COPILOT_FIX"), obs, policy)).to).toBe("ESCALATED");
  });

  it("holds rather than escalating twice while the owner has it", () => {
    const r = record("COPILOT_FIX", {
      escalation: { reason: "too big", askedAt: "2026-09-05T09:00:00.000Z" },
    });
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    expect(expectWait(plan(r, obs, policy)).why).toContain("waiting on the owner");
  });

  it("hands a large human review back too", () => {
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [review({ author: "ada", state: "CHANGES_REQUESTED" })],
        threads: [thread({ id: "H1", author: "ada" })],
      }),
    });

    expect(expectAdvance(plan(record("HUMAN_FIX"), obs, policy)).to).toBe("ESCALATED");
  });

  it("costs nothing to decide, so it never reaches the agent", () => {
    // The whole point of the ceiling: it is read off the pull request the
    // observation already carried, so refusing is free where the call it
    // prevents is the most expensive one in the lifecycle.
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    const p = plan(record("COPILOT_FIX"), obs, policy);
    const types = p.kind === "settled" ? [] : p.effects.map((effect) => effect.type);

    expect(types).not.toContain("address-threads");
  });

  it("does the work when the ceiling is switched off", () => {
    const obs = observation({
      pullRequest: pullRequest({
        ...huge,
        reviews: [botReview()],
        threads: [botThread({ id: "B1" })],
      }),
    });

    const p = expectAct(
      plan(record("COPILOT_FIX"), obs, {
        ...policy,
        maxPullRequestFiles: 0,
        maxPullRequestLines: 0,
      }),
    );

    expect(p.effects.map((effect) => effect.type)).toEqual(["address-threads"]);
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
    const obs = observation({ pullRequest: pullRequest(), reviewLoad: { "ada": 2, edsger: 1 } });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "alan" }]);
  });

  it("breaks a tie the same way every time", () => {
    const obs = observation({
      pullRequest: pullRequest(),
      reviewLoad: { "ada": 1, alan: 1, edsger: 1 },
    });

    const first = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));
    const again = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(first.effects).toEqual([{ type: "assign-reviewer", host: "ada" }]);
    expect(again.effects).toEqual(first.effects);
  });

  it("skips anybody marked unavailable", () => {
    const obs = observation({
      pullRequest: pullRequest(),
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
    const obs = observation({ pullRequest: pullRequest(), reviewLoad: { "ada": 5, alan: 5, edsger: 5 } });

    const p = expectWait(
      plan(record("REVIEWER_ASSIGNED", { attempts: { REVIEWER_ASSIGNED: 1 } }), obs, policy),
    );

    expect(p.effects).toEqual([]);
  });

  it("assigns the emptiest reviewer while one is still under the ceiling", () => {
    const obs = observation({
      pullRequest: pullRequest(),
      reviewLoad: { "ada": 4, alan: 1, edsger: 4 },
    });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.effects).toEqual([{ type: "assign-reviewer", host: "alan" }]);
  });

  it("refuses to assign on a workday when the roster is stale", () => {
    const obs = observation({ pullRequest: pullRequest(), roster: roster({ confirmedOn: "2026-09-01" }), now: WORKDAY });

    const p = expectWait(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.retryAfterMs).toBe(policy.rosterBackoffMs);
    expect(p.effects[0]).toMatchObject({ type: "announce" });
  });

  it("asks only on the first look, so a stale roster does not spam", () => {
    const obs = observation({ pullRequest: pullRequest(), roster: roster({ confirmedOn: "2026-09-01" }) });
    const later = record("REVIEWER_ASSIGNED", { attempts: { REVIEWER_ASSIGNED: 1 } });

    expect(expectWait(plan(later, obs, policy)).effects).toEqual([]);
  });

  it("does not need confirmation at the weekend", () => {
    const obs = observation({ pullRequest: pullRequest(), roster: roster({ confirmedOn: "2026-09-01" }), now: WEEKEND });

    expect(expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy)).to).toBe(
      "HUMAN_REVIEW",
    );
  });

  it("holds when the whole roster is away", () => {
    const obs = observation({
      pullRequest: pullRequest(),
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

describe("what the forge says, before a person is asked", () => {
  const at = (state: "passing" | "failing" | "running"): ReturnType<typeof pullRequest> =>
    pullRequest({ checks: { state, commitSha: HEAD } });

  it("waits while the checks are still running, rather than spending a reviewer", () => {
    const obs = observation({ pullRequest: at("running"), reviewLoad: {} });

    expect(expectWait(plan(record("REVIEWER_ASSIGNED"), obs, policy)).why).toContain(
      "have not finished",
    );
  });

  it("hands red checks to the owner instead of assigning anybody", () => {
    const obs = observation({ pullRequest: at("failing"), reviewLoad: {} });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.why).toContain("are red");
  });

  it("hands a conflicting branch to the owner", () => {
    const obs = observation({
      pullRequest: pullRequest({ mergeState: "conflicting" }),
      reviewLoad: {},
    });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.why).toContain("conflicts");
  });

  // A review read against a base the branch has moved off is a review that
  // has to be done again.
  it("hands a branch behind its base to the owner", () => {
    const obs = observation({
      pullRequest: pullRequest({ mergeState: "behind" }),
      reviewLoad: {},
    });

    expect(expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy)).why).toContain("behind");
  });

  // The one that stops this becoming a machine that never assigns anybody in
  // a repository without CI. No checks is an answer, not a red verdict.
  it("assigns a reviewer where the forge runs no checks at all", () => {
    const obs = observation({ pullRequest: pullRequest({ checks: null }), reviewLoad: {} });

    const p = expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy));

    // Which reviewer is the tie-break's business, and it has its own test.
    expect(p.to).toBe("HUMAN_REVIEW");
    expect(p.effects.map((effect) => effect.type)).toEqual(["assign-reviewer"]);
  });

  // The hazard the end-to-end walk found: a check that is configured and
  // never reports leaves a rollup saying `running` for ever, and an
  // unbounded wait here is a ticket that stops with nobody told.
  it("stops waiting on a verdict that never comes, and says so", () => {
    const r = record("REVIEWER_ASSIGNED", {
      attempts: { REVIEWER_ASSIGNED: policy.maxGateAttempts },
    });

    const p = expectAdvance(plan(r, observation({ pullRequest: at("running") }), policy));

    expect(p.to).toBe("ESCALATED");
    expect(p.why).toContain("never finished");
  });

  it("says nothing to the owner a second time while the first is unanswered", () => {
    const r = record("REVIEWER_ASSIGNED", {
      escalation: { reason: "the checks are red", askedAt: WORKDAY.toISOString() },
    });

    expect(expectWait(plan(r, observation({ pullRequest: at("failing") }), policy)).why).toContain(
      "waiting on the owner",
    );
  });

  it("does not read a verdict as a merge state, or the other way round", () => {
    const obs = observation({
      pullRequest: pullRequest({ checks: { state: "passing", commitSha: HEAD } }),
      reviewLoad: {},
    });

    expect(expectAdvance(plan(record("REVIEWER_ASSIGNED"), obs, policy)).to).toBe("HUMAN_REVIEW");
  });
});

describe("a question is not an answer", () => {
  const ASKED = "2026-09-03T10:00:00.000Z";
  const escalated = (overrides: Partial<Parameters<typeof record>[1]> = {}) =>
    record("ESCALATED", {
      resumeAt: "IMPLEMENTING",
      escalation: { reason: "The gate stayed red across 3 attempts.", askedAt: ASKED },
      ...overrides,
    });
  const said = (at: string, body: string, kind?: "discussion" | "decision") => ({
    author: "ada",
    body,
    at,
    fromAmy: false,
    ...(kind ? { kind } : {}),
  });
  const discuss = { ...policy, conversation: "discuss" as const };

  it("answers a reply under discuss in the thread and stays ESCALATED", () => {
    const obs = observation({ conversation: [said("2026-09-03T10:05:00.000Z", "why do you think the gate is wrong?")] });

    const p = expectAct(plan(escalated(), obs, discuss));

    expect(p.effects).toEqual([
      {
        type: "discuss",
        since: ASKED,
        about: "The gate stayed red across 3 attempts.",
        thread: [],
        turns: [{ at: "2026-09-03T10:05:00.000Z", author: "ada", text: "why do you think the gate is wrong?" }],
      },
    ]);
  });

  it("does not answer a turn it already answered, and waits for the decision", () => {
    const r = escalated({
      discussion: { since: ASKED, upTo: "2026-09-03T10:05:00.000Z", lines: ["ada asked: why?", "You answered: because."] },
    });
    const obs = observation({ conversation: [said("2026-09-03T10:05:00.000Z", "why?")] });

    expect(expectWait(plan(r, obs, discuss)).why).toContain("owner");
  });

  it("answers only the turns after the last one it answered, carrying the discussion so far", () => {
    const r = escalated({
      discussion: { since: ASKED, upTo: "2026-09-03T10:05:00.000Z", lines: ["ada asked: why?", "You answered: because."] },
    });
    const obs = observation({
      conversation: [said("2026-09-03T10:05:00.000Z", "why?"), said("2026-09-03T10:07:00.000Z", "and the test?")],
    });

    const [effect] = expectAct(plan(r, obs, discuss)).effects;

    expect(effect).toMatchObject({
      thread: ["ada asked: why?", "You answered: because."],
      turns: [{ text: "and the test?" }],
    });
  });

  it("does not carry a discussion from another wait into this one", () => {
    const r = escalated({
      discussion: { since: "2026-09-01T00:00:00.000Z", upTo: "2026-09-03T10:05:00.000Z", lines: ["ada asked: old"] },
    });
    const obs = observation({ conversation: [said("2026-09-03T10:05:00.000Z", "why?")] });

    expect(expectAct(plan(r, obs, discuss)).effects[0]).toMatchObject({ thread: [], turns: [{ text: "why?" }] });
  });

  it("resumes where the escalation stopped it on a decision", () => {
    const obs = observation({ escalationAnswered: true, conversation: [said("2026-09-03T10:09:00.000Z", "go", "decision")] });

    expect(expectAdvance(plan(escalated(), obs, discuss)).to).toBe("IMPLEMENTING");
  });

  it("answers a reply marked as a discussion under answer, and does not resume", () => {
    const obs = observation({ conversation: [said("2026-09-03T10:05:00.000Z", "why?", "discussion")] });

    expect(expectAct(plan(escalated(), obs, policy)).effects[0]).toMatchObject({ type: "discuss" });
  });

  it("prompts the step it resumes with the whole discussion and the decision last", () => {
    const decision = ["ada asked: why?", "You answered: because.", "ada decided, and this settles it: keep it"];
    const r = record("IMPLEMENTING", {
      escalation: { reason: "r", askedAt: ASKED, resolvedAt: "2026-09-03T10:10:00.000Z", decision },
    });

    expect(expectAct(plan(r, observation(), policy)).effects[0]).toMatchObject({ type: "implement", discussion: decision });
  });

  it("prompts nothing extra while the escalation is still open", () => {
    const r = record("IMPLEMENTING", {
      escalation: { reason: "r", askedAt: ASKED, decision: ["ada decided, and this settles it: keep it"] },
    });

    expect(expectAct(plan(r, observation(), policy)).effects[0]).not.toHaveProperty("discussion");
  });

  it("answers a discussion while a question is open and goes to READY only on the decision", () => {
    const asked = {
      clear: false,
      questions: ["Which currency?"],
      askedQuestions: ["Which currency?"],
      at: ASKED,
    };
    const question = said("2026-09-03T10:05:00.000Z", "what does the invoice show today?");
    const discussed = expectAct(plan(record("CLARIFYING", { triage: asked }), observation({ conversation: [question] }), discuss));
    expect(discussed.effects[0]).toMatchObject({ type: "discuss", since: ASKED, turns: [{ text: question.body }] });

    const r = record("CLARIFYING", {
      triage: asked,
      discussion: { since: ASKED, upTo: question.at, lines: [`ada asked: ${question.body}`, "You answered: euros."] },
    });
    const answered = expectAdvance(
      plan(r, observation({ conversation: [question, said("2026-09-03T10:08:00.000Z", "show the customer's", "decision")] }), discuss),
    );

    expect(answered.to).toBe("READY");
    expect(answered.effects[0]).toMatchObject({
      conversation: [`ada asked: ${question.body}`, "You answered: euros.", "ada answered: show the customer's"],
    });
  });
});

describe("a discussion while a question is open", () => {
  const ASKED = "2026-09-03T10:00:00.000Z";
  const asked = { clear: false, questions: ["Which currency?"], askedQuestions: ["Which currency?"], at: ASKED };
  const discuss = { ...policy, conversation: "discuss" as const };
  const turn = (at: string, body: string, kind?: "discussion" | "decision") => ({ author: "ada", body, at, fromAmy: false, ...(kind ? { kind } : {}) });

  it("does not read its own answer to a discussion as the decision", () => {
    const question = turn("2026-09-03T10:05:00.000Z", "what does it show today?");
    const r = record("CLARIFYING", {
      triage: asked,
      discussion: { since: ASKED, upTo: question.at, lines: ["ada asked: what does it show today?", "You answered: euros."] },
    });

    expect(expectWait(plan(r, observation({ conversation: [question] }), discuss)).why).toContain("answer");
  });

  it("carries a turn said in the same breath as the decision into the triage", () => {
    const requirement = turn("2026-09-03T10:05:00.000Z", "it has to be the customer's currency");
    const decision = turn("2026-09-03T10:05:30.000Z", "use that", "decision");

    const p = expectAdvance(plan(record("CLARIFYING", { triage: asked }), observation({ conversation: [requirement, decision] }), discuss));

    expect(p.to).toBe("READY");
    expect(p.effects[0]).toMatchObject({
      conversation: ["ada asked: it has to be the customer's currency", "ada answered: use that"],
    });
  });
});

describe("a discussion of a disagreement", () => {
  it("names the disagreed threads and the settled clarification for the answer to read", () => {
    const r = record("ESCALATED", {
      resumeAt: "HUMAN_FIX",
      escalation: { reason: "T1: the comment is wrong", askedAt: "2026-09-03T10:00:00.000Z" },
      judged: [
        { threadId: "T1", verdict: "disagreed", note: "the comment is wrong" },
        { threadId: "T2", verdict: "fixed", note: "done" },
      ],
      clarification: ["ada answered: use USD"],
    });
    const obs = observation({ conversation: [{ author: "ada", body: "why is it wrong?", at: "2026-09-03T10:05:00.000Z", fromAmy: false }] });

    expect(expectAct(plan(r, obs, { ...policy, conversation: "discuss" })).effects[0]).toMatchObject({
      type: "discuss",
      threadIds: ["T1"],
      clarification: ["ada answered: use USD"],
    });
  });
});

describe("under answer, the first unmarked reply", () => {
  it("still resumes escalated work, as it always did", () => {
    const r = record("ESCALATED", { resumeAt: "verdict", escalation: { reason: "r", askedAt: "2026-09-03T10:00:00.000Z" } });
    const obs = observation({
      escalationAnswered: true,
      conversation: [{ author: "ada", body: "why?", at: "2026-09-03T10:05:00.000Z", fromAmy: false }],
    });

    expect(expectAdvance(plan(r, obs, policy)).to).toBe("verdict");
  });
});

/**
 * The same, driven through the engine: what a discussion spends, and what it
 * leaves alone. A thread whose replies the test writes, an agent that
 * answers, and a record parked in ESCALATED with a resume point.
 */
describe("a discussion, driven through the engine", () => {
  const ASKED = "2026-09-03T10:00:00.000Z";
  const start = new Date("2026-09-03T10:01:00.000Z");

  function world(options: { conversation: "answer" | "discuss"; budget?: Budget }) {
    let clock = start;
    const said: Reply[] = [];
    const thread = { id: "thread-PROJ-1239" };
    const post = vi.fn<Conversation["post"]>().mockResolvedValue("answer-ts");
    const conversation: Conversation = {
      open: vi.fn<Conversation["open"]>().mockResolvedValue(thread),
      post,
      replies: async (_thread, since) => said.filter((reply) => reply.at > since),
    };
    const prompts: { step?: string; prompt: string }[] = [];
    const contexts: (AskContext | undefined)[] = [];
    const run = { outcome: "completed" as const, harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown" as const, output: "" };
    const ask = vi.fn<(prompt: string, cwd: string, context?: AskContext) => Promise<HarnessReply>>();
    const agent = fakeAgent({
      ask: ask.mockImplementation(async (prompt, _cwd, context) => {
        prompts.push({ step: context?.step, prompt });
        contexts.push(context);
        const discussed = prompts.filter((p) => p.step === "discuss").length;
        return { text: context?.step === "discuss" ? `answer ${discussed}` : "done", run };
      }),
    });
    const git = fakeGit();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-discussion-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    records.save(
      record("ESCALATED", {
        resumeAt: "IMPLEMENTING",
        attempts: { IMPLEMENTING: 3 },
        escalation: { reason: "Implementation failed 3 times.", askedAt: ASKED },
      }),
    );
    const worker = new Worker({
      queue,
      records,
      ...ticketWorkerDeps({
        conversation,
        agent,
        git,
        budget: options.budget,
        policy: { ...policy, conversation: options.conversation },
        now: () => clock,
      }),
    });
    return {
      prompts,
      contexts,
      askedAt: (step: string) => ask.mock.invocationCallOrder[contexts.findIndex((context) => context?.step === step)]!,
      post,
      git,
      records,
      cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
      say(text: string, kind?: Reply["kind"]) {
        clock = new Date(clock.getTime() + 60_000);
        said.push({ at: clock.toISOString(), author: "ada", text, files: [], ...(kind ? { kind } : {}) });
      },
      /** Looks until the queue has nothing due, then lets the poll come round. */
      async look(times = 1) {
        for (let n = 0; n < times; n += 1) {
          queue.enqueue({ workId: "PROJ-1239", reason: "poke" }, clock);
          await worker.tick();
        }
        clock = new Date(clock.getTime() + policy.pollBackoffMs);
      },
      state: () => records.load("PROJ-1239")!,
    };
  }

  it("answers three questions in the thread without moving, and moves on the decision with all six lines", async () => {
    const w = world({ conversation: "discuss" });
    for (const question of ["why did it fail?", "is the test wrong?", "what would you change?"]) {
      w.say(question);
      await w.look();
      expect(w.state().state).toBe("ESCALATED");
    }
    expect(w.post).toHaveBeenCalledTimes(3);
    expect(w.post).toHaveBeenLastCalledWith({ id: "thread-PROJ-1239" }, { text: "answer 3" });

    w.say("change the test and keep the code", "decision");
    await w.look(2);
    w.cleanup();

    const implement = w.prompts.find((p) => p.step === "implement")!.prompt;
    const lines = [
      "ada asked: why did it fail?",
      "You answered: answer 1",
      "ada asked: is the test wrong?",
      "You answered: answer 2",
      "ada asked: what would you change?",
      "You answered: answer 3",
      "ada decided, and this settles it: change the test and keep the code",
    ];
    expect(implement).toContain(lines.map((line) => `- ${line}`).join("\n"));
    expect(implement.trimEnd().indexOf("ada decided")).toBeGreaterThan(implement.indexOf("You answered: answer 3"));
    expect(w.state().history.map((move) => `${move.from}>${move.to}`)).toContain("ESCALATED>IMPLEMENTING");
  });

  it("commits nothing and counts no attempt for a discussion", async () => {
    const w = world({ conversation: "discuss" });
    w.say("why did it fail?");
    await w.look();
    w.cleanup();

    expect(w.git.commitAndPush).not.toHaveBeenCalled();
    expect(w.state().attempts).toEqual({ IMPLEMENTING: 3, ESCALATED: 0 });
    expect(w.state().discussion?.lines).toEqual(["ada asked: why did it fail?", "You answered: answer 1"]);
    expect(w.contexts.find((context) => context?.step === "discuss")).toMatchObject({ readOnly: true });
  });

  it("answers on the work's own branch, which a shared checkout may have left", async () => {
    const w = world({ conversation: "discuss" });
    w.say("why did it fail?");
    await w.look();
    w.cleanup();

    expect(w.git.prepareBranch).toHaveBeenCalledWith("Northwind/northwind-backend", "ada/proj-1239-total-is-wrong", "PROJ-1239");
    expect(w.git.prepareBranch.mock.invocationCallOrder[0]).toBeLessThan(w.askedAt("discuss"));
  });

  it("charges a discussion to the agent's budget, and parks it at the ceiling", async () => {
    expect(dispatchesTo("discuss", "agent")).toBe(true);

    const spent: Budget = {
      mayStart: () => ({ ok: false, window: "perFiveHours", measure: "tokens", used: 10, limit: 10, stopAt: 1, retryAfterMs: 60_000, reason: "spent" }),
    };
    const w = world({ conversation: "discuss", budget: spent });
    w.say("why did it fail?");
    await w.look();
    w.cleanup();

    expect(w.prompts).toEqual([]);
    expect(w.post).not.toHaveBeenCalled();
    expect(w.state().discussion).toBeUndefined();
  });

  it("under answer, answers a reply marked as a discussion and does not resume", async () => {
    const w = world({ conversation: "answer" });
    w.say("why did it fail?", "discussion");
    await w.look();
    w.cleanup();

    expect(w.post).toHaveBeenCalledTimes(1);
    expect(w.state().state).toBe("ESCALATED");
  });

  it("under answer, resumes on the first unmarked reply, as it always did", async () => {
    const w = world({ conversation: "answer" });
    w.say("change the test");
    await w.look();
    w.cleanup();

    expect(w.post).not.toHaveBeenCalled();
    expect(w.state().state).toBe("IMPLEMENTING");
    expect(w.state().escalation?.decision).toEqual(["ada decided, and this settles it: change the test"]);
  });
});

describe("what a clarification settled", () => {
  it("reaches the implementation, not only the triage that cleared it", async () => {
    const ASKED = "2026-09-03T10:00:00.000Z";
    let clock = new Date("2026-09-03T10:10:00.000Z");
    const replies: Reply[] = [
      { at: "2026-09-03T10:05:00.000Z", author: "ada", text: "the invoice is in USD", files: [] },
      { at: "2026-09-03T10:06:00.000Z", author: "ada", text: "use that", files: [], kind: "decision" },
    ];
    const conversation: Conversation = {
      open: async () => ({ id: "t" }),
      post: async () => "m",
      replies: async (_thread, since) => replies.filter((reply) => reply.at > since),
    };
    const prompts: { step?: string; prompt: string }[] = [];
    const run = { outcome: "completed" as const, harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown" as const, output: "" };
    const agent = fakeAgent({
      ask: vi.fn<(prompt: string, cwd: string, context?: AskContext) => Promise<HarnessReply>>().mockImplementation(async (prompt, _cwd, context) => {
        prompts.push({ step: context?.step, prompt });
        return { text: context?.step === "triage" ? JSON.stringify({ clear: true }) : "done", run };
      }),
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-clarified-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    records.save(record("CLARIFYING", { triage: { clear: false, questions: ["Which currency?"], askedQuestions: ["Which currency?"], at: ASKED } }));
    const worker = new Worker({
      queue,
      records,
      ...ticketWorkerDeps({ conversation, agent, policy: { ...policy, conversation: "discuss" }, now: () => clock }),
    });
    for (let look = 0; look < 4 && !prompts.some((p) => p.step === "implement"); look += 1) {
      clock = new Date(clock.getTime() + 60_000);
      queue.enqueue({ workId: "PROJ-1239", reason: "poke" }, clock);
      await worker.tick();
    }
    fs.rmSync(root, { recursive: true, force: true });

    const implement = prompts.find((p) => p.step === "implement")?.prompt ?? "";
    expect(implement).toContain("- ada asked: the invoice is in USD");
    expect(implement).toContain("- ada answered: use that");
  });
});

describe("an escalation answered on the ticket", () => {
  it("carries the owner's comment into the step it resumes, read only once there is one", async () => {
    const ASKED = "2026-09-03T10:00:00.000Z";
    let clock = new Date("2026-09-03T10:10:00.000Z");
    let replied = false;
    const comments = vi.fn<Tracker["comments"]>().mockImplementation(async () =>
      replied ? [{ author: "ada", body: "use USD instead", at: "2026-09-03T10:20:00.000Z", fromAmy: false }] : [],
    );
    const tracker: Tracker = { ...fakeTracker(), comments, hasReplyAfter: async () => replied };
    const prompts: { step?: string; prompt: string }[] = [];
    const run = { outcome: "completed" as const, harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown" as const, output: "" };
    const agent = fakeAgent({
      ask: vi.fn<(prompt: string, cwd: string, context?: AskContext) => Promise<HarnessReply>>().mockImplementation(async (prompt, _cwd, context) => {
        prompts.push({ step: context?.step, prompt });
        return { text: "done", run };
      }),
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-ticket-answer-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    records.save(record("ESCALATED", { resumeAt: "IMPLEMENTING", escalation: { reason: "r", askedAt: ASKED } }));
    const worker = new Worker({ queue, records, ...ticketWorkerDeps({ tracker, agent, now: () => clock }) });
    const look = async () => {
      clock = new Date(clock.getTime() + policy.pollBackoffMs);
      queue.enqueue({ workId: "PROJ-1239", reason: "poke" }, clock);
      await worker.tick();
    };

    await look();
    expect(comments).not.toHaveBeenCalled();
    replied = true;
    await look();
    await look();
    fs.rmSync(root, { recursive: true, force: true });

    expect(records.load("PROJ-1239")?.escalation?.decision).toEqual(["ada decided, and this settles it: use USD instead"]);
    expect(prompts.find((p) => p.step === "implement")?.prompt).toContain("- ada decided, and this settles it: use USD instead");
  });
});

describe("HUMAN_REVIEW, after asking again", () => {
  const ASKED = "2026-09-03T12:00:00.000Z";
  const askedAgain = record("HUMAN_REVIEW", {
    reviewer: "ada",
    history: [{ at: ASKED, from: "RE_REVIEW", to: "HUMAN_REVIEW", why: "asking ada to look again" }],
  });
  const changesRequested = (submittedAt: string, state: "CHANGES_REQUESTED" | "APPROVED" = "CHANGES_REQUESTED") => observation({
    pullRequest: pullRequest({ reviewDecision: state, reviews: [review({ state, submittedAt })] }),
  });

  it("waits for the reviewer when the only review on the head is the one that sent it back", () => {
    // Nothing was pushed, so the head is the one they asked changes on.
    // Reading that review as the answer would ask again on every look.
    const decided = plan(askedAgain, changesRequested("2026-09-03T11:00:00.000Z"), policy);

    expect(expectWait(decided).why).toContain("ada to look again");
  });

  it("reads a review submitted since it asked as the answer", () => {
    expect(expectAdvance(plan(askedAgain, changesRequested("2026-09-03T12:30:00.000Z", "APPROVED"), policy)).to).toBe("APPROVED");
    expect(expectAdvance(plan(askedAgain, changesRequested("2026-09-03T12:30:00.000Z"), policy)).to).toBe("RE_REVIEW");
  });
});

describe("HUMAN_REVIEW, after asking again, reads one review for all three", () => {
  const ASKED = "2026-09-03T12:00:00.000Z";
  const asked = (overrides: Partial<Parameters<typeof record>[1]> = {}) => record("HUMAN_REVIEW", {
    reviewer: "ada",
    history: [
      { at: "2026-09-03T10:00:00.000Z", from: "HUMAN_FIX", to: "RE_REVIEW", why: "every comment was addressed" },
      { at: ASKED, from: "RE_REVIEW", to: "HUMAN_REVIEW", why: "asking ada to look again" },
    ],
    ...overrides,
  });

  it("does not take an old review of the head and a new review of an older commit as an answer", () => {
    const obs = observation({
      pullRequest: pullRequest({
        reviewDecision: "CHANGES_REQUESTED",
        reviews: [
          review({ state: "CHANGES_REQUESTED", submittedAt: "2026-09-03T11:00:00.000Z" }),
          review({ state: "CHANGES_REQUESTED", commitSha: OLD_HEAD, submittedAt: "2026-09-03T12:30:00.000Z" }),
        ],
      }),
    });

    expect(expectWait(plan(asked(), obs, policy)).why).toContain("ada to look again");
  });

  it("under writes: operator, reads a review since the operator was asked, even one before the record moved", () => {
    // The operator asked at 11:30, ada answered at 11:45, and the record only
    // moved to HUMAN_REVIEW at 12:00, when the review was seen.
    const operator = asked({ handedOver: ["request-review@ada@round1"], handedOverAt: { "request-review@ada@round1": "2026-09-03T11:30:00.000Z" } });
    const obs = observation({
      pullRequest: pullRequest({ reviewDecision: "APPROVED", reviews: [review({ state: "APPROVED", submittedAt: "2026-09-03T11:45:00.000Z" })] }),
    });

    expect(expectAdvance(plan(operator, obs, { ...policy, writes: "operator" })).to).toBe("APPROVED");
  });
});
