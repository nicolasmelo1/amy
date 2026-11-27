import { describe, expect, it, vi } from "vitest";
import { Plan, WorkflowRuntime, applyPlan, attemptsIn, movedBy } from "@amykit/core";
import {
  WORKDAY,
  botReview,
  botThread,
  fakeHost,
  fakeTracker,
  mountTicketToQa,
  observation,
  policy,
  pullRequest,
  record,
  review,
  thread,
  ticketWorkerDeps,
} from "@amykit/test-fixtures";
import { plan } from "../src/machine.js";
import { Observation } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";

/** The shipped runtime, folding the way the engine asks it to. */
const runtime = (await ticketWorkerDeps()).runtime as unknown as WorkflowRuntime<TicketRecord, Observation>;

/** One look: what the machine decides, and the record the runtime folds it into. */
function look(current: TicketRecord, seen: Observation, outcomes: Record<string, unknown> = {}): { plan: Plan; next: TicketRecord } {
  const decided = plan(current, seen, policy);
  const next = runtime.apply(applyPlan(current, decided, WORKDAY, outcomes), decided, outcomes, seen, WORKDAY, movedBy(current, decided));
  return { plan: decided, next };
}

/** Where a plan sends the work, whatever kind of plan it is. */
function destination(decided: Plan): string | undefined {
  return decided.kind === "advance" ? decided.to : undefined;
}

describe("a reviewer's open thread on the pull request", () => {
  it("sends the work to IMPLEMENTING, not to a state that changes the code itself", () => {
    const r = record("HUMAN_REVIEW", { reviewer: "ada", pullRequestNumber: 4940 });
    const seen = observation({ pullRequest: pullRequest({ reviews: [review({ state: "CHANGES_REQUESTED" })], reviewDecision: "CHANGES_REQUESTED", threads: [thread()] }) });

    expect(destination(plan(r, seen, policy))).toBe("IMPLEMENTING");
  });

  it("carries the threads it took up into the implementation that follows", () => {
    const r = record("HUMAN_REVIEW", { reviewer: "ada", pullRequestNumber: 4940 });
    const seen = observation({ pullRequest: pullRequest({ reviews: [review({ state: "CHANGES_REQUESTED" })], reviewDecision: "CHANGES_REQUESTED", threads: [thread({ id: "T7" })] }) });

    const { next } = look(r, seen);

    expect(next.state).toBe("IMPLEMENTING");
    expect(JSON.stringify(next)).toContain("T7");
  });
});

describe("an automated review's open thread", () => {
  it("sends the work to IMPLEMENTING", () => {
    const r = record("COPILOT_WAIT", { pullRequestNumber: 4940 });
    const seen = observation({ pullRequest: pullRequest({ reviews: [botReview()], threads: [botThread()] }) });

    expect(destination(plan(r, seen, policy))).toBe("IMPLEMENTING");
  });
});

describe("checks failing on the pull request's head", () => {
  it("are new work for IMPLEMENTING rather than a hand-back to the owner", () => {
    const r = record("REVIEWER_ASSIGNED", { pullRequestNumber: 4940 });
    const seen = observation({ pullRequest: pullRequest({ checks: { state: "failing", commitSha: pullRequest().headSha } }) });

    expect(destination(plan(r, seen, policy))).toBe("IMPLEMENTING");
  });

  it("leave the head standing and charge no attempt when the agent finds nothing to change", () => {
    const reason = "the failing check is a flaky upstream job, nothing in this change touches it";
    const r = record("IMPLEMENTING", {
      pullRequestNumber: 4940,
      lastImplementation: { ok: true, output: reason, at: WORKDAY.toISOString(), progress: { kind: "unchanged", key: "implementation", detail: reason } },
    });
    const seen = observation({ pullRequest: pullRequest({ checks: { state: "failing", commitSha: pullRequest().headSha } }) });

    const { plan: decided, next } = look(r, seen);

    // Nothing was committed, so there is no new head for the checks to vouch for.
    expect(destination(decided)).not.toBe("checks");
    expect(attemptsIn(next, "IMPLEMENTING")).toBe(0);
    expect(next.roundsByOrigin ?? {}).toEqual({});
  });
});

describe("an implementation that changed nothing", () => {
  it.each(["gate", "thread", "owner", "self-review"])("charges no round to the origin %s that sent the work", (origin) => {
    const reason = "the behaviour asked for is already what the code does";
    const r = record("IMPLEMENTING", {
      roundsByOrigin: { [origin]: 1 },
      lastImplementation: { ok: true, output: reason, at: WORKDAY.toISOString(), progress: { kind: "unchanged", key: "implementation", detail: reason } },
    });

    const { plan: decided, next } = look(r, observation());

    expect(destination(decided)).not.toBe("checks");
    expect(next.roundsByOrigin).toEqual({ [origin]: 1 });
    expect(JSON.stringify(next.history.at(-1) ?? {}) + (decided.why ?? "")).toContain(reason);
  });
});

describe("a ticket whose pull request is already open", () => {
  it("is taken up at HUMAN_REVIEW from DISCOVERED when the pull request was reviewed", () => {
    const seen = observation({ pullRequest: pullRequest({ reviews: [review({ state: "COMMENTED" })] }) });

    expect(destination(plan(record("DISCOVERED"), seen, policy))).toBe("HUMAN_REVIEW");
  });

  it("is taken up at REVIEWER_ASSIGNED from CLARIFYING when nobody reviewed it yet", () => {
    const r = record("CLARIFYING", {
      triage: { clear: false, questions: ["Which invoice?"], askedQuestions: ["Which invoice?"], at: WORKDAY.toISOString() },
    });
    const seen = observation({ pullRequest: pullRequest({ reviews: [] }) });

    expect(destination(plan(r, seen, policy))).toBe("REVIEWER_ASSIGNED");
  });
});

describe("the owner's word after the work was handed over", () => {
  it("is new work for IMPLEMENTING from origin owner", () => {
    const r = record("HUMAN_REVIEW", { reviewer: "ada", pullRequestNumber: 4940 });
    const seen = observation({
      pullRequest: pullRequest(),
      conversation: [{ author: "owner@example.test", body: "Please also round the tax line.", at: "2026-09-03T11:30:00.000Z", fromAmy: false }],
    });

    const { next } = look(r, seen);

    expect(next.state).toBe("IMPLEMENTING");
    expect(JSON.stringify(next)).toContain("round the tax line");
    expect(JSON.stringify(next)).toContain("owner");
  });
});

describe("new work weighed against the brief", () => {
  const changesAsked = (threads: ReturnType<typeof thread>[]) => observation({
    pullRequest: pullRequest({ reviews: [review({ state: "CHANGES_REQUESTED" })], reviewDecision: "CHANGES_REQUESTED", threads }),
  });

  it("goes to the owner, asked once, when it undoes what the brief asks for", () => {
    const r = record("HUMAN_REVIEW", {
      reviewer: "ada",
      pullRequestNumber: 4940,
      judged: [{ threadId: "T1", verdict: "contradicts-brief" as never, note: "removing the rounding undoes the brief's first criterion" }],
    });
    const seen = changesAsked([thread({ id: "T1", body: "drop the rounding" })]);

    const first = look(r, seen);
    expect(first.next.state).toBe("ESCALATED");
    expect(first.plan.kind === "advance" ? first.plan.effects.filter((e) => e.type === "escalate") : []).toHaveLength(1);

    const settled = { ...first.next, state: "HUMAN_REVIEW" as const };
    const again = plan(settled, seen, policy);
    expect(again.kind === "advance" ? again.effects.filter((e) => e.type === "escalate") : []).toEqual([]);
  });

  it("answers a thread the brief puts out of scope on the thread, and builds nothing for it", () => {
    const r = record("HUMAN_REVIEW", {
      reviewer: "ada",
      pullRequestNumber: 4940,
      judged: [{ threadId: "T2", verdict: "out-of-scope" as never, note: "currency conversion is out of this brief's scope" }],
    });
    const seen = changesAsked([thread({ id: "T2", body: "add currency conversion" })]);

    const decided = plan(r, seen, policy);

    expect(destination(decided)).not.toBe("IMPLEMENTING");
    const effects = decided.kind === "settled" ? [] : decided.effects;
    expect(effects.some((e) => /reply|answer/.test(e.type) && JSON.stringify(e).includes("T2"))).toBe(true);
  });
});

describe("the owner's word where the work is discussed", () => {
  /** A chat whose thread for the unit holds one reply from the owner. */
  const chatSaying = (text: string, at: string) => ({
    threads: true as const,
    known: vi.fn(async () => ({ id: "thread-1" })),
    open: vi.fn(async () => ({ id: "thread-1" })),
    post: vi.fn(async () => "m1"),
    replies: vi.fn(async (_thread: unknown, since: string) =>
      at > since ? [{ at, author: "owner", text, files: [] }] : []),
  });

  it("in the unit's thread, at a review, is new work for IMPLEMENTING from origin owner", async () => {
    const pr = pullRequest({ reviews: [review()] });
    const mounted = (await mountTicketToQa({
      now: () => WORKDAY,
      host: fakeHost(pr),
      conversation: chatSaying("Please also round the tax line.", "2026-09-03T11:30:00.000Z") as never,
      settings: { repliesOn: ["conversation"] },
    })) as unknown as WorkflowRuntime<TicketRecord, Observation>;
    const r = record("HUMAN_REVIEW", { reviewer: "ada", pullRequestNumber: 4940 });

    const seen = await mounted.observe(r);
    const decided = plan(r, seen, mounted.policy as never);

    expect(seen.pullRequest?.number).toBe(4940);
    expect(destination(decided)).toBe("IMPLEMENTING");
    expect(JSON.stringify(decided)).toContain("round the tax line");
  });

  it("is read only where the config says replies come from", async () => {
    const pr = pullRequest({ reviews: [review()] });
    const comments = vi.fn(async () => [{ author: "owner@example.test", body: "Please also drop the footer.", at: "2026-09-03T11:40:00.000Z", fromAmy: false }]);
    const mounted = (await mountTicketToQa({
      now: () => WORKDAY,
      host: fakeHost(pr),
      tracker: fakeTracker({ comments } as never),
      conversation: chatSaying("Please also round the tax line.", "2026-09-03T11:30:00.000Z") as never,
      settings: { repliesOn: ["code-host"] },
    })) as unknown as WorkflowRuntime<TicketRecord, Observation>;
    const r = record("HUMAN_REVIEW", { reviewer: "ada", pullRequestNumber: 4940 });

    const decided = plan(r, await mounted.observe(r), mounted.policy as never);

    expect(JSON.stringify(decided)).not.toContain("round the tax line");
    expect(JSON.stringify(decided)).not.toContain("drop the footer");
  });

  it("is not an answer the work already acted on before it was built", () => {
    // The question the triage asked was answered at 10:00 and the triage read
    // that answer at 11:00: the work was built from it, so it is not new.
    const r = record("HUMAN_REVIEW", {
      reviewer: "ada",
      pullRequestNumber: 4940,
      triage: { clear: true, questions: [], askedQuestions: ["Which invoice?"], at: "2026-09-03T11:00:00.000Z" },
      clarification: ["owner@example.test answered: the March one"],
    });
    const seen = observation({
      pullRequest: pullRequest({ reviews: [review()] }),
      conversation: [{ author: "owner@example.test", body: "the March one", at: "2026-09-03T10:00:00.000Z", fromAmy: false }],
    });

    expect(destination(plan(r, seen, policy))).not.toBe("IMPLEMENTING");
  });
});

describe("a ticket whose pull request is open on a branch the tracker does not name", () => {
  it.each(["DISCOVERED", "CLARIFYING"] as const)("is found from %s by the id it mentions and taken up at its review", async (state) => {
    const pr = pullRequest({ number: 77, reviews: [] });
    const mounted = (await mountTicketToQa({
      now: () => WORKDAY,
      host: fakeHost(null, { findPullRequestMentioning: vi.fn().mockResolvedValue(pr) }),
    })) as unknown as WorkflowRuntime<TicketRecord, Observation>;
    const r = record(state, state === "CLARIFYING"
      ? { triage: { clear: false, questions: ["Which invoice?"], askedQuestions: ["Which invoice?"], at: WORKDAY.toISOString() } }
      : {});

    const seen = await mounted.observe(r);

    expect(seen.pullRequest?.number).toBe(77);
    expect(destination(plan(r, seen, policy))).toBe("REVIEWER_ASSIGNED");
  });
});

describe("a second thread that contradicts the brief, after the owner settled the first", () => {
  it("is asked of the owner, not built", () => {
    const r = record("HUMAN_REVIEW", {
      reviewer: "ada",
      pullRequestNumber: 4940,
      escalation: { reason: "T1: removing the rounding undoes the brief", askedAt: "2026-09-03T09:00:00.000Z", resolvedAt: "2026-09-03T09:30:00.000Z" },
      judged: [
        { threadId: "T1", verdict: "fixed", note: "the change answers it" },
        { threadId: "T2", verdict: "contradicts-brief" as never, note: "dropping the currency undoes the brief's second criterion" },
      ],
    });
    const seen = observation({
      pullRequest: pullRequest({
        reviews: [review({ state: "CHANGES_REQUESTED" })],
        reviewDecision: "CHANGES_REQUESTED",
        threads: [thread({ id: "T1", isResolved: true }), thread({ id: "T2", body: "drop the currency" })],
      }),
    });

    const decided = plan(r, seen, policy);

    expect(destination(decided)).not.toBe("IMPLEMENTING");
    expect(decided.kind === "advance" ? decided.effects.filter((e) => e.type === "escalate" && JSON.stringify(e).includes("T2")) : []).toHaveLength(1);
  });
});

describe("checks failing on the head that the agent finds nothing to change for", () => {
  it("charge no round to anybody, taken up and answered", () => {
    const failing = observation({ pullRequest: pullRequest({ reviews: [botReview(), review()], checks: { state: "failing", commitSha: pullRequest().headSha } }) });
    const taken = look(record("REVIEWER_ASSIGNED", { pullRequestNumber: 4940 }), failing);
    expect(taken.next.state).toBe("IMPLEMENTING");

    const reason = "the failing check is a flaky upstream job, nothing in this change touches it";
    const ran = look(taken.next, observation(), {
      implementation: { ok: true, output: reason, at: "2026-09-03T12:30:00.000Z", progress: { kind: "unchanged", key: "implementation", detail: reason } },
    });
    const { next } = look(ran.next, observation());

    expect(next.roundsByOrigin ?? {}).toEqual({});
  });
});

describe("a record saved before rounds were counted per origin", () => {
  const legacy = (state: TicketRecord["state"], over: Partial<TicketRecord>): TicketRecord => {
    const { roundsByOrigin: _rounds, climbedByOrigin: _climbed, ...rest } = record(state, over) as TicketRecord & { climbedByOrigin?: unknown };
    return rest as TicketRecord;
  };

  it("is worked again from IMPLEMENTING however many attempts it once failed, every origin read at zero", () => {
    const r = legacy("IMPLEMENTING", {
      attempts: { IMPLEMENTING: 3 },
      lastImplementation: { ok: false, at: "2026-09-03T10:00:00.000Z", output: "broken" },
    });

    const decided = plan(r, observation(), policy);

    expect(destination(decided)).not.toBe("ESCALATED");
    expect(decided.kind).toBe("act");
  });

  it("sends a red gate back to IMPLEMENTING as the gate's first round, however many verdicts it once had", () => {
    const r = legacy("verdict", {
      attempts: { verdict: 3, IMPLEMENTING: 3 },
      lastImplementation: { ok: true, at: "2026-09-03T10:00:00.000Z", output: "" },
      lastGate: { ok: false, at: "2026-09-03T10:05:00.000Z", output: "typecheck failed" },
      lanes: { GATE: { call: "PROJ-1239/GATE#3", end: "RED" }, SELF_REVIEW: { call: "PROJ-1239/SELF_REVIEW#3", end: "APPROVED" } },
    } as Partial<TicketRecord>);

    const { plan: decided, next } = look(r, observation());

    expect(destination(decided)).toBe("IMPLEMENTING");
    expect(next.roundsByOrigin).toEqual({ gate: 1 });
  });
});

describe("an implementing run that changed nothing", () => {
  it("is decided on, not held in IMPLEMENTING, and the work it answered is not sent back to it", () => {
    const failing = observation({ pullRequest: pullRequest({ reviews: [botReview(), review()], checks: { state: "failing", commitSha: pullRequest().headSha } }) });
    const taken = look(record("REVIEWER_ASSIGNED", { pullRequestNumber: 4940 }), failing);
    expect(taken.next.state).toBe("IMPLEMENTING");

    const reason = "the failing check is a flaky upstream job, nothing in this change touches it";
    const ran = look(taken.next, failing, {
      implementation: { ok: true, output: reason, at: "2026-09-03T12:30:00.000Z", progress: { kind: "unchanged", key: "implementation", detail: reason } },
    });
    const after = look(ran.next, failing);

    expect(after.plan.kind).not.toBe("wait");
    expect(after.next.state).not.toBe("IMPLEMENTING");

    const later = look(after.next, failing);
    expect(destination(later.plan)).not.toBe("IMPLEMENTING");
  });
});

describe("implementing runs that keep failing on a record that counts rounds per origin", () => {
  it("stop at ESCALATED rather than running again for ever", () => {
    let current = record("IMPLEMENTING", { roundsByOrigin: { gate: 1 } } as Partial<TicketRecord>);
    let minute = 0;
    for (let look_ = 0; look_ < 100 && current.state === "IMPLEMENTING"; look_ += 1) {
      minute += 1;
      const at = new Date(Date.UTC(2026, 8, 3, 13, minute)).toISOString();
      const decided = plan(current, observation(), policy);
      const outcomes = decided.kind === "act" ? { implementation: { ok: false, output: "the agent failed", at } } : {};
      current = runtime.apply(applyPlan(current, decided, WORKDAY, outcomes), decided, outcomes, observation(), WORKDAY, movedBy(current, decided));
    }

    expect(current.state).toBe("ESCALATED");
  });
});
