import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Plan } from "@amykit/core";
import { botReview, botThread, observation, policy, pullRequest, record, review, thread } from "@amykit/test-fixtures";
import { plan } from "../src/machine.js";
import { Observation } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";
import { TicketState } from "../src/state.js";

const FALSIFIER = "code_changes_outside_implementing";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/**
 * The decision, with the mutation this property has to reject in it: a review
 * state that fixes the code where it stands instead of sending it back.
 */
function decided(current: TicketRecord, seen: Observation): Plan {
  const answer = plan(current, seen, policy);
  if (!planted || answer.kind !== "advance") return answer;
  return { kind: "act", effects: [{ type: "implement" }], why: answer.to };
}

/** The deciding states after READY that read the pull request, each with a reviewer recorded where it needs one. */
const AFTER_READY: { state: TicketState; record: Partial<TicketRecord> }[] = [
  { state: "COPILOT_WAIT", record: { pullRequestNumber: 4940 } },
  { state: "REVIEWER_ASSIGNED", record: { pullRequestNumber: 4940 } },
  { state: "HUMAN_REVIEW", record: { pullRequestNumber: 4940, reviewer: "ada" } },
];

/** Every kind of new work the pull request can show. */
const NEW_WORK: Record<string, Partial<Observation>> = {
  "a reviewer's thread": { pullRequest: pullRequest({ reviews: [botReview(), review({ state: "CHANGES_REQUESTED" })], reviewDecision: "CHANGES_REQUESTED", threads: [thread()] }) },
  "an automated thread": { pullRequest: pullRequest({ reviews: [botReview(), review()], threads: [botThread()] }) },
  "checks failing on the head": { pullRequest: pullRequest({ reviews: [botReview(), review()], checks: { state: "failing", commitSha: pullRequest().headSha } }) },
};

/** The states that may change the code: only one. */
const CHANGES_CODE = new Set<string>(["IMPLEMENTING"]);

describe("new work after READY", () => {
  it("code_changes_outside_implementing", () => {
    fc.assert(
      fc.property(fc.constantFrom(...AFTER_READY), fc.constantFrom(...Object.keys(NEW_WORK)), (from, kind) => {
        const answer = decided(record(from.state, from.record), observation(NEW_WORK[kind]));

        // No state but IMPLEMENTING changes the code, so new work never acts here.
        const acts = answer.kind === "act" ? answer.effects.map((e) => e.type) : [];
        expect(acts.filter((type) => type === "implement" || type === "address-threads")).toEqual([]);

        // Wherever the work was, new work sends it to the one place code changes.
        const to = answer.kind === "advance" ? answer.to : answer.kind;
        expect(CHANGES_CODE.has(to) ? to : `${from.state} -> ${to} on ${kind}`).toBe("IMPLEMENTING");
      }),
    );
  });
});
