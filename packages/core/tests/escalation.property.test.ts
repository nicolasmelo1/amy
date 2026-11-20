import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Climb, type EscalationRules, climbOf, levelFor } from "../src/escalation.js";

const FALSIFIER = "one_rung_and_permanent";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: a rung read from the round count alone. */
const climb = (rules: EscalationRules, origin: string, rounds: number, findings: number, climbed = 0): Climb => {
  if (!planted) return climbOf(rules, origin, rounds, findings, climbed);
  const { level, needed } = levelFor(rules, origin, findings);
  const rung = Math.floor(rounds / needed);
  return { origin, level, needed, rounds, rung, exhausted: rung >= rules.rungs - 1 };
};

const LEVELS = ["patient", "normal", "immediate"] as const;

/** An origin whose beyond level is the one after its own, at a threshold it names. */
const origin = fc.integer({ min: 0, max: 1 }).chain((at) =>
  fc.record({
    level: fc.constant(LEVELS[at as 0 | 1]!),
    beyond: fc.constant(LEVELS[(at + 1) as 1 | 2]!),
    findingsAt: fc.integer({ min: 1, max: 6 }),
  }),
);

/** A scale of three named levels, each a number of rounds one rung costs. */
const scale = fc.record({
  patient: fc.integer({ min: 2, max: 5 }),
  normal: fc.integer({ min: 1, max: 4 }),
  immediate: fc.constant(1),
});

describe("a climb of one origin", () => {
  it("one_rung_and_permanent", () => {
    fc.assert(
      fc.property(scale, origin, fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), (needs, rules, above) => {
        const all: EscalationRules = { scale: needs, origins: { gate: rules }, rungs: 4 };
        let climbed = 0;

        for (let rounds = 0; rounds <= above.length * 2; rounds += 1) {
          // The findings of a round sit on one side of the threshold, and move.
          const findings = above[rounds % above.length]! ? rules.findingsAt + 1 : Math.max(0, rules.findingsAt - 1);
          const one = climb(all, "gate", rounds, findings, climbed);

          // (a) the threshold picks the level, and nothing else does.
          expect(one.level).toBe(findings >= rules.findingsAt ? rules.beyond : rules.level);

          // (b) a level's number of rounds buys one rung, and the round that reaches it is the first.
          expect(one.rung).toBeGreaterThanOrEqual(Math.floor(rounds / one.needed));
          expect(climb(all, "gate", one.needed - 1, findings, 0).rung).toBe(0);
          expect(climb(all, "gate", one.needed, findings, 0).rung).toBe(1);

          // (c) neither a further round nor fewer findings walks the rung back down.
          expect(one.rung).toBeGreaterThanOrEqual(climbed);
          expect(one.exhausted).toBe(one.rung >= all.rungs - 1);
          climbed = one.rung;
        }
      }),
    );
  });
});
