import { describe, it, expect } from "vitest";
import { WORKDAY, record } from "@amykit/test-fixtures";
import { applyOutcomes, applyTicketPlan } from "../src/outcomes.js";

const LATER = new Date("2026-09-03T13:00:00.000Z");

describe("applyOutcomes", () => {
  it("stores the outcomes the actions produced", () => {
    const next = applyOutcomes(record("IMPLEMENTING"), {
      implementation: { ok: true, output: "done", at: LATER.toISOString() },
      implemented: { repo: "acme/widgets", revision: "c0ffee" },
    });

    expect(next.lastImplementation).toEqual({ ok: true, output: "done", at: LATER.toISOString() });
    // The commit both checks are lent next.
    expect(next.implemented).toEqual({ repo: "acme/widgets", revision: "c0ffee" });
  });

  it("adds a verdict for a thread it has not judged before", () => {
    const next = applyOutcomes(record("HUMAN_FIX"), {
      verdicts: [{ threadId: "T1", verdict: "fixed", note: "deleted it" }],
    });

    expect(next.judged).toEqual([{ threadId: "T1", verdict: "fixed", note: "deleted it" }]);
  });

  it("replaces the verdict for a thread rather than judging it twice", () => {
    const before = record("HUMAN_FIX", {
      judged: [{ threadId: "T1", verdict: "disagreed", note: "old" }],
    });

    const next = applyOutcomes(before, {
      verdicts: [{ threadId: "T1", verdict: "fixed", note: "new" }],
    });

    expect(next.judged).toEqual([{ threadId: "T1", verdict: "fixed", note: "new" }]);
  });

  it("puts parked comments back in play when the owner settles an escalation", () => {
    const before = record("ESCALATED", {
      judged: [
        { threadId: "T1", verdict: "disagreed", note: "the types prove this" },
        { threadId: "T2", verdict: "fixed", note: "done" },
      ],
      escalation: { reason: "T1", askedAt: WORKDAY.toISOString() },
    });

    const next = applyOutcomes(before, { escalationResolvedAt: LATER.toISOString() });

    expect(next.escalation?.resolvedAt).toBe(LATER.toISOString());
    // The disagreement is gone so it gets judged again, the fix is kept so it
    // is not redone.
    expect(next.judged).toEqual([{ threadId: "T2", verdict: "fixed", note: "done" }]);
  });

  it("does nothing with a resolution when there is no escalation", () => {
    const next = applyOutcomes(
      record("HUMAN_FIX", { judged: [{ threadId: "T1", verdict: "disagreed", note: "n" }] }),
      { escalationResolvedAt: LATER.toISOString() },
    );

    expect(next.judged).toHaveLength(1);
  });
});

describe("applyTicketPlan", () => {
  it("folds what the core knows and what only this workflow knows, in one call", () => {
    const next = applyTicketPlan(
      record("IMPLEMENTING"),
      { kind: "advance", to: "checks", effects: [], why: "the agent finished" },
      { implementation: { ok: true, output: "", at: LATER.toISOString() } },
      LATER,
    );

    expect(next.state).toBe("checks");
    expect(next.lastImplementation?.ok).toBe(true);
    expect(next.history).toHaveLength(1);
  });

  it("counts a round of checks each time the lanes meet at the verdict, and not on the way back from the owner", () => {
    const met = applyTicketPlan(record("checks", { attempts: { verdict: 1 } }), { kind: "advance", to: "verdict", effects: [], why: "both ended" }, {}, LATER);
    const back = applyTicketPlan(record("ESCALATED", { attempts: { verdict: 3 } }), { kind: "advance", to: "verdict", effects: [], why: "answered" }, {}, LATER);

    expect(met.attempts.verdict).toBe(2);
    expect(back.attempts).toEqual({});
  });
});
