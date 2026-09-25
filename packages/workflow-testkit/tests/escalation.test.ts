import { WorkRecord } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { Finding, conformance } from "../src/index.js";
import { advance, runtimeOf, settled, wait, workflowOf } from "./machines.js";

interface Escalating extends WorkRecord {
  askedAt?: string;
}

interface Owner {
  answered: boolean;
}

/** Gives up at once, then waits for the owner — `terminal` is whether it ever stops waiting. */
function givingUp(terminal: boolean) {
  return workflowOf<Owner>({
    states: ["working", "escalated", "done"],
    terminal: terminal ? ["done", "escalated"] : ["done"],
    waiting: ["escalated"],
    plan: (record, observation) => {
      if (record.state === "working") return advance("escalated", "escalate");
      if (record.state === "escalated") {
        if (terminal) return settled();
        return observation.answered ? advance("done") : wait();
      }
      return settled();
    },
  });
}

/**
 * An owner who answered something yesterday, and answers again today.
 *
 * `readsTheDate` is the difference between reading "is there a reply" and
 * "is there a reply since I asked" — the second is the only one that is about
 * the question.
 */
function anOwner(readsTheDate: boolean) {
  const replies = ["2026-09-02T09:00:00.000Z"];
  let clock: () => Date = () => new Date();
  return {
    runtime: (_world: unknown, now: () => Date) => {
      clock = now;
      return runtimeOf<Escalating, Owner>("working", {
        observe: (record) => ({
          answered: readsTheDate ? replies.some((at) => record.askedAt !== undefined && at > record.askedAt) : replies.length > 0,
        }),
        actions: {
          escalate: async (_action, ctx) => {
            ctx.outcomes.askedAt = now().toISOString();
          },
        },
        apply: (record, outcomes) => (outcomes.askedAt ? { ...record, askedAt: outcomes.askedAt as string } : record),
      });
    },
    worlds: [{ name: "an owner who answers", meanwhile: [() => { replies.push(clock().toISOString()); }] }],
  };
}

const escalationOf = (findings: Finding[]) => findings.filter((finding) => finding.property === "escalation");

describe("escalation", () => {
  it("fails a giving-up state that is terminal", async () => {
    const findings = escalationOf(await conformance(givingUp(true), anOwner(true)));

    expect(findings).toEqual([
      {
        property: "escalation",
        message: "`escalated` is where the machine gives up, and it is terminal: nothing the person does can get the work out of it",
      },
    ]);
  });

  it("fails a giving-up state left on an answer that was there before it gave up", async () => {
    const findings = escalationOf(await conformance(givingUp(false), anOwner(false)));

    expect(findings).toEqual([
      {
        property: "escalation",
        message:
          "an owner who answers: `escalated` moved to `done` straight after giving up, before the world moved. " +
          "It resumed on something that was already there, not on an answer",
      },
    ]);
  });

  it("passes a giving-up state that waits for an answer given after it", async () => {
    expect(await conformance(givingUp(false), anOwner(true))).toEqual([]);
  });

  it("treats a state named in givesUp as giving up, without an escalate action", async () => {
    const declining = workflowOf({
      states: ["working", "declined"],
      terminal: ["declined"],
      plan: (record) => (record.state === "working" ? advance("declined") : settled()),
    });

    const findings = await conformance(declining, {
      runtime: () => runtimeOf("working", { observe: () => ({}) }),
      worlds: [{ name: "a refusal" }],
      givesUp: ["declined", "abandoned"],
    });

    expect(escalationOf(findings).map((finding) => finding.message)).toEqual([
      "`declined` is where the machine gives up, and it is terminal: nothing the person does can get the work out of it",
      "`abandoned` is named in givesUp, and is not one of the states",
    ]);
  });

  it("does not hold a world that starts already escalated to the look after", async () => {
    const findings = await conformance(givingUp(false), {
      ...anOwner(false),
      worlds: [{ name: "answered long ago", start: (now) => ({ id: "x", state: "escalated", updatedAt: now.toISOString(), attempts: {}, history: [] }) }],
    });

    expect(escalationOf(findings)).toEqual([]);
  });
});
