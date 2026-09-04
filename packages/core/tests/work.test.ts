import { describe, it, expect } from "vitest";
import { WorkRecord, actionsOf, applyPlan } from "../src/work.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const LATER = new Date("2026-09-03T13:00:00.000Z");

/**
 * Built here rather than imported from a workflow's fixtures, so these tests
 * prove the core folds a record without knowing what the work is.
 */
function record(state: string, overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: "WORK-1",
    state,
    updatedAt: NOW.toISOString(),
    attempts: {},
    history: [],
    ...overrides,
  };
}

describe("applyPlan", () => {
  it("counts work done inside a state", () => {
    const next = applyPlan(record("IMPLEMENTING"), { kind: "act", effects: [{ type: "implement" }], why: "try" }, LATER);

    expect(next.attempts.IMPLEMENTING).toBe(1);
    expect(next.state).toBe("IMPLEMENTING");
  });

  it("counts a wait, so a state can tell its first look from its tenth", () => {
    const next = applyPlan(record("CLARIFYING"), { kind: "wait", retryAfterMs: 1000, why: "holding", effects: [] }, LATER);

    expect(next.attempts.CLARIFYING).toBe(1);
  });

  it("does not count an advance, since its actions are not retried", () => {
    const next = applyPlan(
      record("RE_REVIEW"),
      { kind: "advance", to: "HUMAN_REVIEW", effects: [{ type: "request-rereview" }], why: "again" },
      LATER,
    );

    expect(next.attempts.RE_REVIEW).toBeUndefined();
    expect(next.state).toBe("HUMAN_REVIEW");
  });

  it("writes the transition into the history with its reason", () => {
    const next = applyPlan(record("READY"), { kind: "advance", to: "IMPLEMENTING", effects: [], why: "nothing blocking" }, LATER);

    expect(next.history).toEqual([
      { at: LATER.toISOString(), from: "READY", to: "IMPLEMENTING", why: "nothing blocking" },
    ]);
  });

  it("leaves the record it was given untouched", () => {
    const before = record("IMPLEMENTING");

    applyPlan(before, { kind: "act", effects: [{ type: "implement" }], why: "try" }, LATER);

    expect(before.attempts).toEqual({});
    expect(before.history).toEqual([]);
  });

  it("keeps whatever a workflow added to the record", () => {
    // The core folds four fields and must not drop the rest.
    const before = { ...record("IMPLEMENTING"), judged: ["T1"], reviewer: "ada" };

    const next = applyPlan(before, { kind: "advance", to: "CHECKED", effects: [], why: "done" }, LATER);

    expect(next).toMatchObject({ judged: ["T1"], reviewer: "ada", state: "CHECKED" });
  });
});

describe("actionsOf", () => {
  it("reads the actions off every kind of plan that carries them", () => {
    expect(actionsOf({ kind: "act", effects: [{ type: "triage" }], why: "a" })).toEqual([{ type: "triage" }]);
    expect(actionsOf({ kind: "advance", to: "READY", effects: [{ type: "run-gate" }], why: "b" })).toEqual([
      { type: "run-gate" },
    ]);
    expect(actionsOf({ kind: "wait", retryAfterMs: 1, why: "c", effects: [{ type: "announce" }] })).toEqual([
      { type: "announce" },
    ]);
  });

  it("reads nothing off a settled plan", () => {
    expect(actionsOf({ kind: "settled", why: "done" })).toEqual([]);
  });
});
