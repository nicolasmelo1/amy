import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { plan } from "../src/machine.js";
import { readAs } from "../src/discussion.js";
import { Policy } from "../src/observation.js";
import { observation, policy, record } from "@amykit/test-fixtures";

const FIRST_FALSIFIER = "a_later_answer_replaces_the_first";
const REPLAY_FALSIFIER = "a_replay_loses_the_answer";

const ASK = "Which currency?";
const asked = {
  clear: false,
  questions: [{ prompt: ASK, answers: ["BRL", "USD", "EUR"] }],
  askedQuestions: [ASK],
  at: "2026-09-03T10:00:00.000Z",
};

function falsifier(): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SF_FALSIFIER;
}

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
  it("a_later_answer_replaces_the_first", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom("BRL", "USD", "EUR"), { minLength: 2, maxLength: 3 }),
      (answers) => {
        const expected = falsifier() === FIRST_FALSIFIER ? answers.at(-1)! : answers[0]!;
        expect(selected(answers)).toContain(`ada answered: ${ASK}: ${expected}`);
      },
    ), { numRuns: 200 });
  });

  it("a_replay_loses_the_answer", () => {
    fc.assert(fc.property(fc.constantFrom("BRL", "USD", "EUR"), (choice) => {
      const replayed = selected([choice]);
      const expected = falsifier() === REPLAY_FALSIFIER ? [] : replayed;
      expect(selected([choice])).toEqual(expected);
      expect(replayed).toContain(`ada answered: ${ASK}: ${choice}`);
    }), { numRuns: 200 });
  });

  it("an_answer_reads_as_policy_says", () => {
    fc.assert(fc.property(fc.constantFrom("answer", "discuss") as fc.Arbitrary<Policy["conversation"]>, (conversation) => {
      const policy = { conversation } as Policy;
      expect(readAs({ author: "ada", body: "", at: "now", fromAmy: false, answer: { ask: "currency", chosen: ["BRL"] } }, policy)).toBe("decision");
      expect(readAs({ author: "ada", body: "typed", at: "now", fromAmy: false }, policy)).toBe(
        conversation === "answer" ? "decision" : "discussion",
      );
    }), { numRuns: 200 });
  });
});
