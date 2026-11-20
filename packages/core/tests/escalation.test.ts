import { describe, expect, it } from "vitest";
import { type EscalationRules, climbFor, counted, levelFor, strictest } from "../src/escalation.js";
import type { WorkRecord } from "../src/work.js";

/** The named scale a config carries, and four rungs: the last one is a person. */
const RULES: EscalationRules = {
  scale: { patient: 3, normal: 2, immediate: 1 },
  origins: {
    gate: { level: "patient" },
    thread: { level: "normal", beyond: "immediate", findingsAt: 2 },
    proof: { level: "patient", beyond: "normal", findingsAt: 1 },
  },
  rungs: 4,
};

function record(rounds: Record<string, number>): WorkRecord {
  return {
    id: "T-1",
    state: "IMPLEMENTING",
    updatedAt: "2026-11-20T12:00:00.000Z",
    attempts: {},
    roundsByOrigin: rounds,
    history: [],
  };
}

describe("rounds counted by origin", () => {
  it("counts a round where it came from and leaves every other origin alone", () => {
    // Two origins on one record: the thread has come back twice, the gate never.
    const seen = record({ thread: 2, gate: 0 });

    const thread = climbFor(RULES, seen, "thread", 0);
    const gate = climbFor(RULES, seen, "gate", 0);

    // escalation.ts:90 reads `record.roundsByOrigin?.[origin]`, never the whole map.
    expect(thread).toMatchObject({ origin: "thread", level: "normal", needed: 2, rounds: 2, rung: 1 });
    expect(gate).toMatchObject({ origin: "gate", level: "patient", needed: 3, rounds: 0, rung: 0 });

    // escalation.ts:115 adds one round to the climbing origin only.
    const climbed = counted(seen, thread);
    expect(climbed.roundsByOrigin).toEqual({ thread: 3, gate: 0 });
    expect(climbed.climbedByOrigin).toEqual({ thread: 1 });
    expect(climbFor(RULES, climbed, "gate", 0).rung).toBe(0);
    expect(climbFor(RULES, climbed, "thread", 0).rung).toBe(1);
  });

  it("gives each lane of one join its own round, and asks the level that escalates sooner", () => {
    const joined = record({ gate: 1, thread: 1 });

    // escalation.ts:112 counts the round for the origin named on the climb.
    const gate = counted(joined, climbFor(RULES, joined, "gate", 0));
    const thread = counted(joined, climbFor(RULES, joined, "thread", 0));
    expect(gate.roundsByOrigin).toEqual({ gate: 2, thread: 1 });
    expect(thread.roundsByOrigin).toEqual({ gate: 1, thread: 2 });

    const climbs = [climbFor(RULES, gate, "gate", 0), climbFor(RULES, thread, "thread", 0)];
    const winner = strictest(climbs)!;

    // escalation.ts:99 keeps the climb whose rung is greater, not the first seen.
    expect(climbs[0]!.rung).toBe(0);
    expect(climbs[1]!.rung).toBe(1);
    expect(winner.origin).toBe("thread");
    expect(winner.rung).toBeGreaterThan(climbs[0]!.rung);
    expect(strictest([...climbs].reverse())?.origin).toBe("thread");
    expect(strictest([])).toBeUndefined();
  });

  it("says an origin whose rounds ran out on the top rung is exhausted", () => {
    // escalation.ts:80: exhausted once the rung reaches the last one before a person.
    const nearTop = climbFor(RULES, record({ thread: 4 }), "thread", 0);
    const spent = climbFor(RULES, record({ thread: 6 }), "thread", 0);

    expect([nearTop.rung, nearTop.exhausted]).toEqual([2, false]);
    expect([spent.rung, spent.exhausted]).toEqual([3, true]);
    expect(spent.exhausted).toBe(spent.rung >= RULES.rungs - 1);
  });

  // The schema key removal is A8's, and its proof is the machine suite: it
  // lands with the workflow that stops reading the two ceilings.
});

describe("the level an origin is counted at", () => {
  it("refuses an origin nobody configured, naming it", () => {
    // escalation.ts:49 refuses rather than weighing the work at a guessed level.
    expect(() => levelFor(RULES, "owner", 0)).toThrow(
      "nothing says how `owner` escalates: name it under escalation.origins",
    );
  });

  it("refuses a level the scale does not name, naming the origin and the level", () => {
    // escalation.ts:56 refuses a level nothing gives a number of rounds.
    const unknown: EscalationRules = { ...RULES, origins: { gate: { level: "strict" } } };

    expect(() => levelFor(unknown, "gate", 0)).toThrow(
      "`gate` escalates at `strict`, and escalation.scale names no such level",
    );
  });
});

describe("the rung a round leaves the work on", () => {
  /** The same scale, with an origin patient below two findings and immediate from two on. */
  const MIXED: EscalationRules = {
    ...RULES,
    origins: { ...RULES.origins, owner: { level: "patient", beyond: "immediate", findingsAt: 2 } },
  };

  /**
   * Plays the rounds one origin sent back, each with the findings it brought,
   * through the record exactly as a workflow would: weigh the round, count it.
   * Answers the rung the next round starts on, read with no findings yet,
   * because the next round has not come back.
   */
  function after(findings: readonly number[], origin = "owner"): { rung: number; exhausted: boolean } {
    let seen = record({});
    for (const found of findings) seen = counted(seen, climbFor(MIXED, seen, origin, found));
    const next = climbFor(MIXED, seen, origin, 0);
    return { rung: next.rung, exhausted: next.exhausted };
  }

  it("starts the next round one rung higher once a round reached its level's number", () => {
    // owner: patient (3) below two findings, immediate (1) from two on.
    expect(after([5]).rung).toBe(1);
    expect(after([0, 0, 0]).rung).toBe(1);
  });

  it("keeps the rung a round earned when the next round finds less", () => {
    expect(after([5, 0]).rung).toBe(1);
    expect(after([5, 0, 0]).rung).toBeGreaterThanOrEqual(1);
  });

  it("climbs one rung, not several, when the level turns stricter after patient rounds", () => {
    // Two rounds that did not reach the patient level, then one at immediate:
    // that round reached immediate's number, so the work moves one rung.
    const owner = after([0, 0, 5]);
    expect(owner.rung).toBe(1);
    expect(owner.exhausted).toBe(false);
  });

  it("counts the rounds toward the next rung from the rung the work reached", () => {
    // proof: patient (3) below one finding, normal (2) from one on.
    // One round at normal earns nothing yet; two do. Then three patient
    // rounds on that rung earn the next.
    expect(after([1, 1], "proof").rung).toBe(1);
    expect(after([1, 1, 0, 0, 0], "proof").rung).toBe(2);
  });
});

describe("the strictest of two lanes that met at one join", () => {
  it("applies the stricter level when both lanes stand on the same rung, whichever came first", () => {
    const joined = record({ gate: 1, thread: 1 });
    const gate = climbFor(RULES, joined, "gate", 0); // patient, rung 0
    const thread = climbFor(RULES, joined, "thread", 5); // immediate, rung 1 or 0

    const sameRung = [{ ...gate, rung: 0 }, { ...thread, rung: 0 }];
    expect(strictest(sameRung)?.level).toBe("immediate");
    expect(strictest([...sameRung].reverse())?.level).toBe("immediate");
  });
});
