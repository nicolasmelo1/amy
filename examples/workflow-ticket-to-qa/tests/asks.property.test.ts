import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { plan } from "../src/machine.js";
import { readAs } from "../src/discussion.js";
import { Policy } from "../src/observation.js";
import { observation, policy, record } from "@amykit/test-fixtures";

const POLICY_FALSIFIER = "an_answer_reads_as_policy_says";

/** The mutation the policy property must reject: a reader that ignores the answer a reply carries. */
const read: typeof readAs = process.env.SF_FALSIFIER === POLICY_FALSIFIER
  ? (said, policy) => readAs({ ...said, answer: undefined }, policy)
  : readAs;

const ASK = "Which currency?";
const asked = {
  clear: false,
  questions: [{ prompt: ASK, answers: ["BRL", "USD", "EUR"] }],
  askedQuestions: [ASK],
  at: "2026-09-03T10:00:00.000Z",
};

function selected(sequence: readonly string[]) {
  const decision = plan(record("CLARIFYING", { triage: asked }), observation({
    conversation: sequence.map((choice, index) => ({
      author: "ada",
      body: "",
      at: `2026-09-03T10:${String(index + 1).padStart(2, "0")}:00.000Z`,
      fromAmy: false,
      answer: { ask: ASK, chosen: [choice] },
    })),
  }), { ...policy, conversation: "discuss" });
  expect(decision.kind).toBe("advance");
  const effect = decision.kind === "advance" ? decision.effects[0] : undefined;
  expect(effect).toMatchObject({ type: "triage" });
  return (effect as { type: "triage"; conversation: string[] }).conversation;
}

describe("closed-answer workflow policy", () => {
  // Which answer an adapter hands over is proven against Slack and Telegram
  // (plugins/*/tests/asks.property.test.ts). Here, only how the planner
  // reads what it is handed.
  it("plans the first of several answers to one question", () => {
    for (const answers of [["BRL", "USD"], ["USD", "EUR", "BRL"]]) {
      expect(selected(answers)).toContain(`ada answered: ${ASK}: ${answers[0]}`);
    }
  });

  it("plans a replayed answer the same way twice", () => {
    for (const choice of ["BRL", "USD", "EUR"]) {
      const replayed = selected([choice]);
      expect(selected([choice])).toEqual(replayed);
      expect(replayed).toContain(`ada answered: ${ASK}: ${choice}`);
    }
  });

  it("an_answer_reads_as_policy_says", () => {
    fc.assert(fc.property(fc.constantFrom("answer", "discuss") as fc.Arbitrary<Policy["conversation"]>, (conversation) => {
      const policy = { conversation } as Policy;
      expect(read({ author: "ada", body: "", at: "now", fromAmy: false, answer: { ask: "currency", chosen: ["BRL"] } }, policy)).toBe("decision");
      expect(read({ author: "ada", body: "typed", at: "now", fromAmy: false }, policy)).toBe(
        conversation === "answer" ? "decision" : "discussion",
      );
    }), { numRuns: 200 });
  });
});
