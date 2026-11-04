import { describe, expect, it } from "vitest";
import { checkPlanBoard, PlanBoardInput } from "../src/plan-board.js";

function input(overrides: Partial<PlanBoardInput> = {}): PlanBoardInput {
  return {
    gates: [
      {
        name: "queue",
        plan: "docs/design/queue.md",
        requiredAssertions: ["queue.claims_what_was_enqueued"],
      },
    ],
    planFiles: ["plans/next-steps.md", "plans/a-future.md"],
    listedPlans: ["plans/a-future.md"],
    designNotes: {
      "docs/design/queue.md": "proof: assertion:queue.claims_what_was_enqueued",
    },
    ...overrides,
  };
}

describe("checkPlanBoard", () => {
  it("accepts gates whose criteria live in durable design notes", () => {
    expect(checkPlanBoard(input())).toEqual([]);
  });

  it("rejects a gate that points back into plans", () => {
    const problems = checkPlanBoard(
      input({ gates: [{ name: "queue", plan: "plans/old.md", requiredAssertions: [] }] }),
    );

    expect(problems).toEqual(["gate queue still points at plans/old.md"]);
  });

  it("rejects a plan file absent from the execution order", () => {
    const problems = checkPlanBoard(input({ listedPlans: [] }));

    expect(problems).toEqual(["plans/a-future.md is not listed in plans/next-steps.md"]);
  });

  it("rejects a missing criterion in the design note", () => {
    const problems = checkPlanBoard(
      input({ designNotes: { "docs/design/queue.md": "the decision" } }),
    );

    expect(problems).toEqual([
      "gate queue requires queue.claims_what_was_enqueued, but docs/design/queue.md does not name it",
    ]);
  });

  it("rejects a gate whose design note is missing", () => {
    const problems = checkPlanBoard(input({ designNotes: {} }));

    expect(problems).toEqual(["gate queue points at missing design note docs/design/queue.md"]);
  });

  describe("a plan's declaration", () => {
    const declared = {
      crosses: [{ mechanism: "engines", answer: "n/a", why: "no engine is called" }],
      guarantee: [{ holds: "a restart loses no answer", not_against: "a power loss" }],
    };
    const withDeclaration = (declaration: unknown) =>
      checkPlanBoard(input({ declarations: { "plans/a-future.md": declaration } }));

    it("accepts a plan that answers crosses and names what it does not hold against", () => {
      expect(withDeclaration(declared)).toEqual([]);
    });

    it("rejects a plan with no crosses", () => {
      expect(withDeclaration({ ...declared, crosses: [] })).toEqual([
        "plans/a-future.md answers no mechanism under crosses",
      ]);
    });

    it("rejects a plan with no guarantee", () => {
      expect(withDeclaration({ crosses: declared.crosses })).toEqual([
        "plans/a-future.md declares no guarantee, so its review has no failure model",
      ]);
    });

    it("rejects a guarantee that does not say what it is not against", () => {
      expect(withDeclaration({ ...declared, guarantee: [{ holds: "it works" }] })).toEqual([
        "plans/a-future.md guarantee 1 needs both holds and not_against",
      ]);
    });

    it("rejects a plan with no declaration at all", () => {
      expect(withDeclaration(undefined)).toEqual([
        "plans/a-future.md answers no mechanism under crosses",
        "plans/a-future.md declares no guarantee, so its review has no failure model",
      ]);
    });
  });
});
