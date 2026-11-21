import { describe, it, expect } from "vitest";
import { Plan, WorkflowRuntime, applyPlan, movedBy } from "@amykit/core";
import { plan } from "../src/machine.js";
import { drive, mountedTicket } from "./mounted.js";
import { Observation } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";
import { TicketState } from "../src/state.js";
import {
  WORKDAY,
  botReview,
  botThread,
  observation,
  policy,
  pullRequest,
  record,
  thread,
  ticketWorkerDeps,
} from "@amykit/test-fixtures";

const huge = { changedFiles: 500, additions: 19_000, deletions: 1_000 };
const at = (time: string, ok: boolean, output = "") => ({ ok, at: `2026-09-03T${time}:00.000Z`, output });

/** Every state that can raise an escalation, in the situation that makes it raise one. */
const RAISED_FROM: { state: TicketState; record: Partial<TicketRecord>; observation: Partial<Observation> }[] = [
  {
    state: "IMPLEMENTING",
    record: { attempts: { IMPLEMENTING: policy.maxImplementAttempts }, lastImplementation: at("10:00", false, "broken") },
    observation: {},
  },
  {
    state: "verdict",
    record: {
      attempts: { verdict: policy.maxGateAttempts, IMPLEMENTING: policy.maxImplementAttempts },
      lastImplementation: at("10:00", true),
      lastGate: at("10:05", false, "typecheck failed"),
      lanes: { GATE: { call: "PROJ-1239/GATE#3", end: "RED" }, SELF_REVIEW: { call: "PROJ-1239/SELF_REVIEW#3", end: "APPROVED" } },
    },
    observation: {},
  },
  {
    state: "COPILOT_FIX",
    record: {},
    observation: { pullRequest: pullRequest({ ...huge, reviews: [botReview()], threads: [botThread({ id: "B1" })] }) },
  },
  {
    state: "REVIEWER_ASSIGNED",
    record: {},
    observation: { pullRequest: pullRequest({ mergeState: "conflicting" }), reviewLoad: {} },
  },
  {
    state: "HUMAN_FIX",
    record: { reviewer: "edsger", judged: [{ threadId: "T1", verdict: "disagreed", note: "the types prove it" }] },
    observation: { pullRequest: pullRequest({ threads: [thread()] }) },
  },
];

/** The shipped runtime, folding the way the engine asks it to. */
const runtime = (await ticketWorkerDeps()).runtime as unknown as WorkflowRuntime<TicketRecord, Observation>;

function look(current: TicketRecord, seen: Observation, outcomes: Record<string, unknown> = {}): { plan: Plan; next: TicketRecord } {
  const decided = plan(current, seen, policy);
  const next = runtime.apply(applyPlan(current, decided, WORKDAY, outcomes), decided, outcomes, seen, WORKDAY, movedBy(current, decided));
  return { plan: decided, next };
}

describe("an escalation remembers the state it interrupted", () => {
  for (const raised of RAISED_FROM) {
    it(`goes back to ${raised.state} when the owner answers`, () => {
      const escalation = { reason: "needs the owner", askedAt: "2026-09-03T11:00:00.000Z" };
      const seen = observation(raised.observation);

      const into = look(record(raised.state, raised.record), seen, { escalation });
      expect(into.plan).toMatchObject({ kind: "advance", to: "ESCALATED" });
      // The record the fold was handed was already ESCALATED; the resume
      // point came from the move, which is the only place it could.
      expect(into.next).toMatchObject({ state: "ESCALATED", resumeAt: raised.state });

      const out = look(into.next, observation({ ...raised.observation, escalationAnswered: true }));
      expect(out.plan).toMatchObject({ kind: "advance", to: raised.state });
      expect(out.next.state).toBe(raised.state);
      expect(out.next.resumeAt).toBeUndefined();
    });
  }

  it("starts every retry budget again, so a state that gave up on attempts or looks does not give up on its first look back", () => {
    const [implementing] = RAISED_FROM;
    const seen = observation();

    const into = look(record("IMPLEMENTING", { ...implementing!.record, looks: { IMPLEMENTING: policy.maxImplementAttempts } }), seen, {
      escalation: { reason: "failed", askedAt: "2026-09-03T11:00:00.000Z" },
    });
    const back = look(into.next, observation({ escalationAnswered: true })).next;

    expect(back.attempts).toEqual({});
    expect(back.looks).toEqual({});
    expect(plan(back, seen, policy)).toMatchObject({ kind: "act", effects: [{ type: "implement" }] });
  });

  it("resumes a record escalated before the resume point existed where escalations always went", () => {
    const legacy = record("ESCALATED", { escalation: { reason: "old", askedAt: "2026-09-01T09:00:00.000Z" } });

    expect(plan(legacy, observation({ escalationAnswered: true }), policy)).toMatchObject({
      kind: "advance",
      to: "HUMAN_FIX",
    });
  });

  it("leaves the resume point alone on a look that did not move", () => {
    const waiting = record("ESCALATED", {
      resumeAt: "verdict",
      escalation: { reason: "red", askedAt: "2026-09-03T11:00:00.000Z" },
    });

    expect(look(waiting, observation()).next.resumeAt).toBe("verdict");
  });
});

describe("a round the checks send back", () => {
  const clock = new Date("2026-09-03T12:00:00.000Z");

  /** An agent that implements, and reviews the change by asking for changes with two findings. */
  const asking = {
    ask: async (_prompt: string, _cwd: string, context?: { step?: string }) => {
      const run = { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } as const;
      if (context?.step === "triage") return { text: '{"clear": true}', run };
      if (context?.step === "self-review") return { text: "- the total rounds twice\n- the currency is not named\nCHANGES_ASKED", run };
      return { text: "done", run };
    },
  };

  async function oneRound(gate: object): Promise<TicketRecord> {
    let at = clock.getTime();
    const now = () => new Date((at += 1000));
    const mounted = await mountedTicket({ agent: asking, gate }, now);
    return drive(mounted, mounted.runtime.newRecord("PROJ-1239", now()), now, (current) => current.state === "IMPLEMENTING" && current.lastGate !== undefined);
  }

  const redGate = { run: async () => ({ ok: false, output: "2 checks red", at: new Date().toISOString(), findings: 2 }) };

  it("keeps how many findings the self-review brought back", async () => {
    const back = await oneRound(redGate);

    expect(back.lastSelfReview?.verdict).toBe("CHANGES_ASKED");
    expect(typeof back.lastSelfReview?.findings).toBe("number");
    expect(back.lastSelfReview?.findings).toBeGreaterThan(0);
  });

  it("counts the round toward each origin that sent it back, and toward no other", async () => {
    const back = await oneRound(redGate);

    expect(Object.values(back.roundsByOrigin ?? {}).reduce((sum, n) => sum + n, 0)).toBe(2);
    expect(Object.keys(back.roundsByOrigin ?? {}).sort()).toHaveLength(2);
  });
});
