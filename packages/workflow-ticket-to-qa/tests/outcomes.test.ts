import { describe, it, expect } from "vitest";
import { WORKDAY, record } from "@amykit/test-fixtures";
import { applyOutcomes, applyTicketPlan } from "../src/outcomes.js";

const LATER = new Date("2026-09-03T13:00:00.000Z");

describe("applyOutcomes", () => {
  it("stores the outcomes the actions produced", () => {
    const next = applyOutcomes(record("CHECKED"), {
      gate: { ok: false, output: "lint: 3 problems", at: LATER.toISOString() },
    });

    expect(next.lastGate).toEqual({
      ok: false,
      output: "lint: 3 problems",
      at: LATER.toISOString(),
    });
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
      record("CHECKED"),
      { kind: "advance", to: "PR_OPEN", effects: [], why: "the gate is green" },
      { gate: { ok: true, output: "", at: LATER.toISOString() } },
      LATER,
    );

    expect(next.state).toBe("PR_OPEN");
    expect(next.lastGate?.ok).toBe(true);
    expect(next.history).toHaveLength(1);
  });
});
