import { describe, it, expect } from "vitest";
import { WorkRecord, Plan, actionsOf, applyPlan, attemptsIn, looksIn } from "../src/work.js";
import { act, advance, wait } from "../src/define-workflow.js";

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
  it("counts an act as one look and one try", () => {
    const next = applyPlan(record("IMPLEMENTING"), { kind: "act", effects: [{ type: "implement" }], why: "try" }, LATER);

    expect(next.attempts.IMPLEMENTING).toBe(1);
    expect(next.looks?.IMPLEMENTING).toBe(1);
    expect(next.state).toBe("IMPLEMENTING");
  });

  it("counts a wait as a look without spending a try", () => {
    const next = applyPlan(record("CLARIFYING"), { kind: "wait", retryAfterMs: 1000, why: "holding", effects: [] }, LATER);

    expect(next.attempts.CLARIFYING).toBeUndefined();
    expect(next.looks?.CLARIFYING).toBe(1);
  });

  it("counts preparation as a look without spending a try", () => {
    const next = applyPlan(
      record("IMPLEMENTING"),
      { kind: "act", attempt: false, effects: [{ type: "prepare-branch" }], why: "the tree is ready" },
      LATER,
    );

    expect(next.attempts.IMPLEMENTING).toBeUndefined();
    expect(next.looks?.IMPLEMENTING).toBe(1);
  });

  it("refunds an action whose outcome says the try did not happen", () => {
    const next = applyPlan(
      record("IMPLEMENTING", { attempts: { IMPLEMENTING: 2 }, looks: { IMPLEMENTING: 4 } }),
      { kind: "act", effects: [{ type: "implement" }], why: "try" },
      LATER,
      { implementation: { notATry: true } },
    );

    expect(next.attempts.IMPLEMENTING).toBe(2);
    expect(next.looks?.IMPLEMENTING).toBe(5);
  });

  it("gives a saved legacy record its attempts as looks without changing its tries", () => {
    const next = applyPlan(record("IMPLEMENTING", { attempts: { IMPLEMENTING: 2 } }), {
      kind: "wait", retryAfterMs: 1000, why: "holding", effects: [],
    }, LATER);

    expect(next.attempts.IMPLEMENTING).toBe(2);
    expect(next.looks?.IMPLEMENTING).toBe(3);
    expect(looksIn(record("IMPLEMENTING", { attempts: { IMPLEMENTING: 2 } }), "IMPLEMENTING")).toBe(2);
    expect(attemptsIn(next, "IMPLEMENTING")).toBe(2);
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

describe("a ceiling reached only by trying", () => {
  // The plan's exit condition: three implementation attempts allowed, the
  // tree held for five looks and prepared before every try, and an agent
  // that fails every time. Only the three runs of the agent count.
  const MAX_ATTEMPTS = 3;
  const HOLD_LOOKS = 5;

  function decide(record: WorkRecord & { prepared?: boolean }, held: boolean): Plan {
    if (held) return wait(60_000, "the checkout is held by another ticket");
    const tries = attemptsIn(record, "IMPLEMENTING");
    if (tries >= MAX_ATTEMPTS) {
      return advance("ESCALATED", `the implementation did not come together in ${tries} attempts`, { type: "escalate" });
    }
    if (!record.prepared) return act("put the tree on its branch", { attempt: false }, { type: "prepare-branch" });
    return act("implement", { type: "implement" });
  }

  it("escalates after three runs of the agent, however long the tree was held", () => {
    let current: WorkRecord & { prepared?: boolean } = record("IMPLEMENTING");
    let held = HOLD_LOOKS;
    const ran: string[] = [];
    let escalation: Plan | undefined;

    for (let look = 0; look < 50 && current.state === "IMPLEMENTING"; look++) {
      const plan = decide(current, held > 0);
      if (held > 0) held--;
      ran.push(...actionsOf(plan).map((action) => action.type));
      if (plan.kind === "advance") escalation = plan;
      const prepared = plan.kind === "act" && plan.attempt === false;
      current = { ...applyPlan(current, plan, LATER), prepared };
    }

    expect(current.state).toBe("ESCALATED");
    expect(ran.filter((type) => type === "implement")).toHaveLength(MAX_ATTEMPTS);
    expect(ran.filter((type) => type === "prepare-branch")).toHaveLength(MAX_ATTEMPTS);
    expect(escalation?.why).toBe("the implementation did not come together in 3 attempts");
    expect(looksIn(current, "IMPLEMENTING")).toBe(HOLD_LOOKS + 2 * MAX_ATTEMPTS);
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
