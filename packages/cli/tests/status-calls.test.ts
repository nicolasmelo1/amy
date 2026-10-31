import { renderText } from "@amykit/ui";
import { describe, expect, it } from "vitest";
import { statusView, type StatusRecord, type StatusSnapshot } from "../src/status-page.js";

const INBOX = "/home/amy/profiles/oncall/needs-input";

function snapshot(records: StatusRecord[]): StatusSnapshot {
  return {
    at: "2026-10-30T12:00:00.000Z",
    home: "/home/amy",
    profile: "oncall",
    workflow: "oncall",
    mounted: true,
    problems: [],
    states: ["PAGED", "REVIEW", "RESOLVED"],
    waitingStates: [],
    terminalStates: ["RESOLVED"],
    records,
    queue: { due: 0, pending: 1, running: 0, finished: 0 },
    loop: null,
    paused: null,
    notes: 0,
    needsInput: 0,
  };
}

const escalated: StatusRecord = {
  id: "PAGE-1",
  state: "REVIEW",
  waiting: false,
  finished: false,
  repo: null,
  pullRequest: null,
  updatedAt: "2026-10-30T12:00:00.000Z",
  attempts: {},
  history: [{ at: "2026-10-30T11:00:00.000Z", from: "PAGED", to: "REVIEW", why: "paged" }],
  calls: [
    { id: "PAGE-1/REVIEW#1", state: "FIX", history: [{ at: "2026-10-30T11:10:00.000Z", from: "READING", to: "FIX", why: "changes asked" }] },
    { id: "PAGE-1/REVIEW#1/FIX#1", state: "ESCALATED", history: [{ at: "2026-10-30T11:20:00.000Z", from: "FIXING", to: "ESCALATED", why: "the gate stayed red after 3 attempts" }] },
  ],
  attention: true,
};

describe("amy status, for work inside a call", () => {
  it("shows where in the tree the work is, from its root down", () => {
    const page = renderText(statusView(snapshot([escalated]), { all: false, inbox: INBOX }));

    expect(page).toContain("REVIEW › FIX › ESCALATED");
  });

  it("shows attention at the root when a callee escalated, with the move that stopped it", () => {
    const page = renderText(statusView(snapshot([escalated]), { all: false, inbox: INBOX }));

    expect(page).toMatch(/PAGE-1\s+REVIEW › FIX › ESCALATED\s+attention/);
    expect(page).toContain("PAGE-1 needs you: PAGE-1/REVIEW#1/FIX#1 stopped in ESCALATED — the gate stayed red after 3 attempts");
  });

  it("says nothing more for work whose calls are still running", () => {
    const running = { ...escalated, calls: [escalated.calls![0]!], attention: false };

    const page = renderText(statusView(snapshot([running]), { all: false, inbox: INBOX }));

    expect(page).toMatch(/PAGE-1\s+REVIEW › FIX\s+active/);
    expect(page).not.toContain("needs you");
  });

  it("says the root is waiting when the record it waits on is", () => {
    const held = { ...escalated, calls: [{ id: "PAGE-1/REVIEW#1", state: "HELD", history: [] }], attention: false, waitingInACall: true };

    const page = renderText(statusView(snapshot([held]), { all: false, inbox: INBOX }));

    expect(page).toMatch(/PAGE-1\s+REVIEW › HELD\s+waiting/);
  });
});


describe("amy status, for work waiting on lanes", () => {
  const forked: StatusRecord = {
    ...escalated,
    id: "BILL-1",
    state: "checks",
    calls: [],
    attention: true,
    lanes: [
      { lane: "GATE", id: "BILL-1/GATE#1", state: "GREEN", ended: true, attention: false, history: [{ at: "2026-10-30T11:30:00.000Z", from: "CHECKING", to: "GREEN", why: "the gate is green" }] },
      { lane: "SELF_REVIEW", id: "BILL-1/SELF_REVIEW#1", state: "ESCALATED", ended: false, attention: true, history: [{ at: "2026-10-30T11:40:00.000Z", from: "REVIEWING", to: "ESCALATED", why: "the brief contradicts itself" }] },
    ],
  };

  it("draws the lanes side by side, each where its record is, and how many have arrived", () => {
    const page = renderText(statusView(snapshot([forked]), { all: false, inbox: INBOX }));

    expect(page).toContain("checks › GATE GREEN ∥ SELF_REVIEW ESCALATED (1/2 arrived)");
  });

  it("says which lane needs the person, with the move that stopped it", () => {
    const page = renderText(statusView(snapshot([forked]), { all: false, inbox: INBOX }));

    expect(page).toContain("BILL-1 needs you: the lane SELF_REVIEW (BILL-1/SELF_REVIEW#1) stopped in ESCALATED — the brief contradicts itself");
  });
});
