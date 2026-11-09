import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPlan } from "@amykit/core";
import { act } from "../src/effects.js";
import { newRecord } from "./drawn.js";

const FALSIFIER = "limit_charged_as_attempt";
const chargesLimit = process.env.SF_FALSIFIER === FALSIFIER;

describe("rate limits refund the implementation attempt", () => {
  it("limit_charged_as_attempt", () => {
    fc.assert(fc.property(fc.nat({ max: 6 }), fc.nat({ max: 300_000 }), (spent, retryAfterMs) => {
      const record = { ...newRecord("PROJ-1239", new Date("2026-09-03T10:00:00.000Z")), state: "IMPLEMENTING" as const, attempts: { IMPLEMENTING: spent } };
      const outcomes = chargesLimit ? {} : { waited: { notATry: true as const, retryAfterMs } };
      const next = applyPlan(record, act("implement", { type: "implement" }), new Date("2026-09-03T10:01:00.000Z"), outcomes);
      expect(next.attempts.IMPLEMENTING).toBe(spent);
      expect(next.looks?.IMPLEMENTING).toBe(spent + 1);
    }), { numRuns: 200 });
  });
});
