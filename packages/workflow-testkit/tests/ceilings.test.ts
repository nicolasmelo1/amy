import { WorkRecord } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { Finding, conformance } from "../src/index.js";
import { act, advance, runtimeOf, settled, wait, workflowOf } from "./machines.js";

interface Implementing extends WorkRecord {
  implemented?: boolean;
  tries?: number;
}

/**
 * The shape that escalated a real ticket: a hold on a checkout another ticket
 * was standing in, counted against the ceiling on implementation attempts.
 * `countsTheHold` is the defect; the other half keeps its own count of tries.
 */
function implementing(countsTheHold: boolean) {
  return workflowOf<{ checkoutHeld: boolean }>({
    states: ["implementing", "escalated", "done"],
    terminal: ["done"],
    waiting: ["escalated"],
    plan: (record, observation) => {
      const current = record as Implementing;
      if (record.state === "escalated") return wait();
      if (record.state === "done") return settled();
      if (observation.checkoutHeld) return wait();
      if (current.implemented) return advance("done");
      const tries = countsTheHold ? (record.attempts.implementing ?? 0) : (current.tries ?? 0);
      return tries >= 3 ? advance("escalated", "escalate") : act("implement");
    },
  });
}

function aSharedCheckout() {
  const checkout = { checkoutHeld: true };
  return {
    runtime: () =>
      runtimeOf<Implementing, { checkoutHeld: boolean }>("implementing", {
        observe: () => ({ ...checkout }),
        actions: {
          implement: async (_action, ctx) => {
            ctx.outcomes.implemented = true;
          },
          escalate: async () => {},
        },
        apply: (record, outcomes) =>
          outcomes.implemented ? { ...record, implemented: true, tries: (record.tries ?? 0) + 1 } : record,
      }),
    worlds: [{ name: "a checkout another ticket holds", meanwhile: [() => { checkout.checkoutHeld = false; }] }],
  };
}

const ceilingsOf = (findings: Finding[]) => findings.filter((finding) => finding.property === "ceilings");

describe("ceilings", () => {
  it("fails a hold that is counted against the ceiling of the work after it", async () => {
    const findings = ceilingsOf(await conformance(implementing(true), aSharedCheckout()));

    expect(findings).toEqual([
      {
        property: "ceilings",
        message:
          "a checkout another ticket holds: `implementing` held, then went on to act with `implement`; had the hold " +
          "lasted 10 look(s) longer it would move to `escalated` with `escalate` instead. The wait was counted as a try",
      },
    ]);
  });

  it("passes the same hold when the workflow counts its own tries", async () => {
    expect(ceilingsOf(await conformance(implementing(false), aSharedCheckout()))).toEqual([]);
  });

  it("fails a waiting state that gives up after enough looks at a world that never changed", async () => {
    const impatient = workflowOf<{ answered: boolean }>({
      states: ["asking", "escalated", "done"],
      terminal: ["done"],
      waiting: ["asking", "escalated"],
      plan: (record, observation) => {
        if (record.state !== "asking") return record.state === "done" ? settled() : wait();
        if (observation.answered) return advance("done");
        return (record.attempts.asking ?? 0) >= 3 ? advance("escalated", "escalate") : wait();
      },
    });

    const findings = await conformance(impatient, {
      runtime: () => runtimeOf<WorkRecord, { answered: boolean }>("asking", { observe: () => ({ answered: false }), actions: { escalate: async () => {} } }),
      worlds: [{ name: "nobody answers" }],
    });

    expect(ceilingsOf(findings)).toEqual([
      {
        property: "ceilings",
        message:
          "nobody answers: `asking` is a waiting state, and after 3 more look(s) at a world that had not changed it " +
          "would move to `escalated` with `escalate`. A look is not a try; give up on time, or on something the world said",
      },
    ]);
  });

  it("replays a wait's own actions when it holds the wait longer", async () => {
    // The first wait asks, and records that it did; a wait that never asked is
    // the one that gives up. Replaying the hold without the wait's actions
    // would never record the question and call a correct workflow impatient.
    const asking = workflowOf<{ answered: boolean }>({
      states: ["asking", "escalated", "done"],
      terminal: ["done"],
      waiting: ["asking", "escalated"],
      plan: (record, observation) => {
        if (record.state !== "asking") return record.state === "done" ? settled() : wait();
        if (observation.answered) return advance("done");
        if ((record as WorkRecord & { asked?: boolean }).asked) return wait();
        if ((record.attempts.asking ?? 0) >= 2) return advance("escalated", "escalate");
        return { kind: "wait", retryAfterMs: 60_000, why: "asking", effects: [{ type: "ask" }] };
      },
    });

    const findings = await conformance(asking, {
      runtime: () =>
        runtimeOf<WorkRecord & { asked?: boolean }, { answered: boolean }>("asking", {
          observe: () => ({ answered: false }),
          actions: { ask: async (_action, ctx) => { ctx.outcomes.asked = true; }, escalate: async () => {} },
          apply: (record, outcomes) => (outcomes.asked ? { ...record, asked: true } : record),
        }),
      worlds: [{ name: "nobody answers yet" }],
    });

    expect(ceilingsOf(findings)).toEqual([]);
  });

  it("passes a waiting state that gives up on a deadline rather than on a count", async () => {
    // Time is held still while the wait is held longer, so a deadline is never
    // reached by the probe, and a correct timeout is not mistaken for a count.
    const deadline = new Date("2026-09-03T13:00:00.000Z");
    const patient = workflowOf<{ answered: boolean; now: Date }>({
      states: ["asking", "escalated", "done"],
      terminal: ["done"],
      waiting: ["asking", "escalated"],
      plan: (record, observation) => {
        if (record.state !== "asking") return record.state === "done" ? settled() : wait();
        if (observation.answered) return advance("done");
        return observation.now >= deadline ? advance("escalated", "escalate") : wait();
      },
    });
    const answered = { value: false };

    const findings = await conformance(patient, {
      runtime: (world, now) =>
        runtimeOf<WorkRecord, { answered: boolean; now: Date }>("asking", {
          observe: () => ({ answered: world.name === "somebody answers" && answered.value, now: now() }),
          actions: { escalate: async () => {} },
        }),
      worlds: [
        { name: "somebody answers", meanwhile: [() => { answered.value = true; }] },
        { name: "nobody answers in time", meanwhile: Array.from({ length: 80 }, () => () => {}) },
      ],
    });

    expect(ceilingsOf(findings)).toEqual([]);
    // The deadline really was reached in the second world: `escalated` is
    // arrived in, and only left unanswered because this sketch never answers it.
    expect(findings).toContainEqual({
      property: "reachability",
      message: "nothing leaves `escalated`: every world that reaches it leaves the work there",
    });
  });
});
