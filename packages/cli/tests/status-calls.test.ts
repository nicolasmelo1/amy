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

