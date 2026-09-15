import { describe, expect, it } from "vitest";
import {
  Agent,
  AttemptOutcome,
  Comment,
  FollowUpRequest,
  Gate,
  Ticket,
  ThreadVerdict,
  Tracker,
  TrackerReads,
  TrackerWrites,
  TrackerWriteCapability,
  TriageOutcome,
  pullRequestTitle,
  trackerCapabilitiesFor,
  trackerWriteFor,
} from "../src/index.js";

/**
 * The ports a workflow declares its dependencies as, exported from the core
 * rather than from the first workflow that happened to ship them.
 *
 * The compile-time half of the claim is the imports above: this file only
 * compiles because the core exports every one of those names. The run-time
 * half is what the assertions say about the write-capability vocabulary,
 * which is what lets a mount refuse a workflow that promised not to edit
 * the tracker.
 */
describe("the ports belong to the core", () => {
  it("exports Tracker, Agent, Gate and Ticket from @amykit/core", () => {
    // Structural rather than truthy: a name that exists but is not a type a
    // workflow can implement is a name nobody can depend on.
    const aTracker: Tracker = null as unknown as Tracker;
    const anAgent: Agent = null as unknown as Agent;
    const aGate: Gate = null as unknown as Gate;
    const aTicket: Ticket = null as unknown as Ticket;
    const aRead: TrackerReads = aTracker;
    const aWrite: TrackerWrites = aTracker;

    expect(aRead).toBe(aTracker);
    expect(aWrite).toBe(aTracker);
    expect(anAgent).toBeNull();
    expect(aGate).toBeNull();
    expect(aTicket).toBeNull();
  });

  it("exports the outcome contracts a workflow and a plugin share", () => {
    const triage: TriageOutcome = null as unknown as TriageOutcome;
    const attempt: AttemptOutcome = null as unknown as AttemptOutcome;
    const verdict: ThreadVerdict = null as unknown as ThreadVerdict;
    const aComment: Comment = null as unknown as Comment;
    const aFollowUp: FollowUpRequest = null as unknown as FollowUpRequest;

    expect(triage).toBeNull();
    expect(attempt).toBeNull();
    expect(verdict).toBeNull();
    expect(aComment).toBeNull();
    expect(aFollowUp).toBeNull();
  });

  it("spells a pull request title the convention's way", () => {
    expect(pullRequestTitle(ticket())).toBe("PROJ-1239: The total is wrong on the invoice");
  });

  it("names every write capability a tracker action can resolve to", () => {
    const capabilities: TrackerWriteCapability[] = [
      "comment",
      "set-status",
      "assign",
      "create-follow-up",
    ];

    // A capability outside the table cannot be declared, and a declaration
    // outside the table cannot be checked.
    expect(trackerCapabilitiesFor(["ask-question"])).toEqual(["comment"]);
    expect(trackerCapabilitiesFor(["hand-off-to-qa"])).toEqual(["set-status"]);
    expect(trackerCapabilitiesFor(["escalate"])).toEqual(["create-follow-up"]);
    expect(trackerCapabilitiesFor(["triage", "implement"])).toEqual([]);
    expect(capabilities).toContain("comment");
  });

  it("refuses a write capability for an action that is not a tracker write", () => {
    expect(trackerWriteFor("triage")).toBeUndefined();
    expect(trackerWriteFor("implement")).toBeUndefined();
    expect(trackerWriteFor("announce")).toBeUndefined();
    expect(trackerWriteFor("nobody-defined-this")).toBeUndefined();
  });
});

function ticket(): Ticket {
  return {
    id: "PROJ-1239",
    title: "The total is wrong on the invoice",
    team: "Platform",
    url: "https://linear.app/northwind/issue/PROJ-1239/total-is-wrong",
    branchName: "ada/proj-1239-total-is-wrong",
    status: "In Progress",
    labels: [],
    repo: "Northwind/northwind-backend",
  };
}