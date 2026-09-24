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
    uses: ["implement", "escalate"],
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
        handlers: {
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
      uses: ["escalate"],
      plan: (record, observation) => {
        if (record.state !== "asking") return record.state === "done" ? settled() : wait();
        if (observation.answered) return advance("done");
        return (record.attempts.asking ?? 0) >= 3 ? advance("escalated", "escalate") : wait();
      },
    });

    const findings = await conformance(impatient, {
      runtime: () => runtimeOf<WorkRecord, { answered: boolean }>("asking", { observe: () => ({ answered: false }), handlers: { escalate: async () => {} } }),
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
});
