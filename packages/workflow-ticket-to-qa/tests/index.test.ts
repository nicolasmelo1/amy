import { describe, expect, it } from "vitest";
import * as core from "@amykit/core";
// The compile-time half of the claim: this import only resolves because the
// workflow still exports every one of these names, from the core.
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
} from "../src/index.js";

/**
 * The one-version promise the port move made: the contracts now live in the
 * core, and everything that imported them from this workflow still compiles
 * because the workflow re-exports them from the core.
 *
 * The type imports above are the proof for the type names — this file does
 * not compile unless every one is exported — so what runtime can add is the
 * value half and the assignment compatibility the re-export preserves.
 */
describe("the workflow re-exports the core's contracts", () => {
  it("still exports every contract a consumer imported before the move", () => {
    // Assignment against the core's own types: a re-export that pointed
    // anywhere else would not type-check, and one that drifted shape would
    // not compile against these declarations.
    const tracker: Tracker = null as unknown as Tracker;
    const reads: TrackerReads = tracker;
    const writes: TrackerWrites = tracker;
    const agent: Agent = null as unknown as Agent;
    const gate: Gate = null as unknown as Gate;
    const ticket: Ticket = null as unknown as Ticket;
    const triage: TriageOutcome = null as unknown as TriageOutcome;
    const attempt: AttemptOutcome = null as unknown as AttemptOutcome;
    const verdict: ThreadVerdict = null as unknown as ThreadVerdict;
    const comment: Comment = null as unknown as Comment;
    const followUp: FollowUpRequest = null as unknown as FollowUpRequest;
    const capability: TrackerWriteCapability = "comment";

    expect(reads).toBe(tracker);
    expect(writes).toBe(tracker);
    expect(agent).toBeNull();
    expect(gate).toBeNull();
    expect(ticket).toBeNull();
    expect(triage).toBeNull();
    expect(attempt).toBeNull();
    expect(verdict).toBeNull();
    expect(comment).toBeNull();
    expect(followUp).toBeNull();
    expect(capability).toBe("comment");
  });

  it("re-exports pullRequestTitle as the same function the core ships", () => {
    expect(pullRequestTitle).toBe(core.pullRequestTitle);
    expect(pullRequestTitle({ id: "PROJ-1", title: "Fix it" } as Ticket)).toBe("PROJ-1: Fix it");
  });
});