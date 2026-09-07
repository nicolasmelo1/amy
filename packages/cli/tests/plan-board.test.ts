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
});
