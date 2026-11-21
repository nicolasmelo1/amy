import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { botReview, botThread, observation, policy, pullRequest, record, review, thread } from "@amykit/test-fixtures";
import { plan } from "../src/machine.js";
import { Observation } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";
import { TicketState } from "../src/state.js";

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
        const decided = plan(record(from.state, from.record), observation(NEW_WORK[kind]), policy);

        // No state but IMPLEMENTING changes the code, so new work never acts here.
        const acts = decided.kind === "act" ? decided.effects.map((e) => e.type) : [];
        expect(acts.filter((type) => type === "implement" || type === "address-threads")).toEqual([]);

        // Wherever the work was, new work sends it to the one place code changes.
        const to = decided.kind === "advance" ? decided.to : decided.kind;
        expect(CHANGES_CODE.has(to) ? to : `${from.state} -> ${to} on ${kind}`).toBe("IMPLEMENTING");
      }),
    );
  });
});
