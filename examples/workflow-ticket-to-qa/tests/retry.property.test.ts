import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPlan } from "@amykit/core";
import { act } from "../src/effects.js";
import { plan } from "../src/machine.js";
import { newRecord } from "./drawn.js";
import { observation, policy } from "@amykit/test-fixtures";

const FALSIFIER = "limit_counted_as_unchanged";
const countsLimit = process.env.SF_FALSIFIER === FALSIFIER;

describe("limits leave the retry budget unchanged", () => {
  it("limit_counted_as_unchanged", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 4 }), (maxImplementAttempts) => {
      let record = { ...newRecord("PROJ-1239", new Date("2026-09-03T10:00:00.000Z")), state: "IMPLEMENTING" as const };
      const limit = act("implementation attempt", { type: "implement" });
      for (let number = 0; number < 2; number += 1) {
        record = applyPlan(record, limit, new Date(`2026-09-03T10:0${number}:00.000Z`), countsLimit ? {} : { waited: { notATry: true as const, retryAfterMs: 1 } });
        expect(record.attempts.IMPLEMENTING ?? 0).toBe(0);
        expect(record.lastImplementation).toBeUndefined();
      }
      for (let number = 0; number < maxImplementAttempts; number += 1) {
        record = applyPlan(record, limit, new Date(`2026-09-03T10:1${number}:00.000Z`), {});
      }
      const decision = plan(record, observation(), { ...policy, maxImplementAttempts });
      expect(decision).toMatchObject({ kind: "advance", to: "ESCALATED" });
    }), { numRuns: 100 });
  });
});
