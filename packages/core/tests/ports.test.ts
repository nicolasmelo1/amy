import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Agent,
  AttemptOutcome,
  Comment,
  Conversation,
  Event,
  EventLog,
  FollowUpRequest,
  Gate,
  Ticket,
  Tracker,
  TrackerReads,
  TrackerWrites,
  TrackerWriteCapability,
  Workplace,
  trackerCapabilitiesFor,
  trackerWriteFor,
  watchEvents,
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
    const attempt: AttemptOutcome = null as unknown as AttemptOutcome;
    const workplace: Workplace = null as unknown as Workplace;
    const aComment: Comment = null as unknown as Comment;
    const aFollowUp: FollowUpRequest = null as unknown as FollowUpRequest;

    expect(attempt).toBeNull();
    expect(workplace).toBeNull();
    expect(aComment).toBeNull();
    expect(aFollowUp).toBeNull();
  });

  it("exports the conversation contract a workflow and adapter share", () => {
    const conversation: Conversation = null as unknown as Conversation;
    expect(conversation).toBeNull();
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
    expect(trackerCapabilitiesFor(["hand-off-to-qa"])).toEqual(["set-status", "assign"]);
    expect(trackerCapabilitiesFor(["escalate"])).toEqual(["create-follow-up"]);
    expect(trackerCapabilitiesFor(["triage", "implement"])).toEqual([]);
    expect(capabilities).toContain("comment");
  });

  it("takes a ticket from a tracker that derives no branch and has no team", () => {
    // GitHub Issues has neither; an adapter for it must not have to invent them.
    const fromAnyTracker: Ticket = {
      id: "acme/widgets#12",
      title: "The total is wrong on the invoice",
      url: "https://example.test/acme/widgets/issues/12",
      status: "open",
      labels: [],
      repo: "acme/widgets",
    };

    expect(fromAnyTracker.branchName).toBeUndefined();
  });

  it("refuses a write capability for an action that is not a tracker write", () => {
    expect(trackerWriteFor("triage")).toBeUndefined();
    expect(trackerWriteFor("implement")).toBeUndefined();
    expect(trackerWriteFor("announce")).toBeUndefined();
    expect(trackerWriteFor("nobody-defined-this")).toBeUndefined();
  });
});

describe("a log nobody can watch is still watched", () => {
  /** A sink with `read` and no `watch`, as a log is allowed to be. */
  const sink = (): EventLog & { lines: Event[] } => {
    const lines: Event[] = [];
    return {
      lines,
      append: (event) => void lines.push(event),
      read: (since) =>
        lines
          .filter((e) => new Date(e.at).getTime() >= (since?.getTime() ?? 0))
          .sort((a, b) => a.at.localeCompare(b.at)),
    };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sees every event by polling, each once, including two at the same instant", () => {
    vi.useFakeTimers();
    const log = sink();
    const seen: Event[] = [];
    log.append({ at: "2026-09-03T12:00:00.000Z", kind: "run.claimed", workId: "W-0" });

    const stop = watchEvents(log, new Date("2026-09-03T00:00:00.000Z"), (e) => seen.push(e), { everyMs: 100 });
    log.append({ at: "2026-09-03T12:00:01.000Z", kind: "work.advanced", workId: "W-1" });
    log.append({ at: "2026-09-03T12:00:01.000Z", kind: "work.advanced", workId: "W-2" });
    vi.advanceTimersByTime(100);
    log.append({ at: "2026-09-03T12:00:01.000Z", kind: "work.advanced", workId: "W-3" });
    log.append({ at: "2026-09-04T00:00:00.000Z", kind: "work.waiting", workId: "W-4" });
    vi.advanceTimersByTime(300);
    stop();

    expect(seen.map((e) => e.workId)).toEqual(["W-0", "W-1", "W-2", "W-3", "W-4"]);
  });

  it("says once that it is polling, and stops when told to", () => {
    vi.useFakeTimers();
    const log = sink();
    const seen: Event[] = [];
    const said: number[] = [];

    const stop = watchEvents(log, new Date(0), (e) => seen.push(e), { onPolling: (ms) => said.push(ms) });
    vi.advanceTimersByTime(5_000);
    stop();
    log.append({ at: "2026-09-03T12:00:00.000Z", kind: "run.claimed" });
    vi.advanceTimersByTime(5_000);

    expect(said).toEqual([1_000]);
    expect(seen).toEqual([]);
  });

  it("uses the log's own watch when it has one, and never polls it", () => {
    const watched: Date[] = [];
    const log: EventLog = {
      append: () => undefined,
      read: () => {
        throw new Error("a watchable log is never polled");
      },
      watch: (since) => {
        watched.push(since);
        return () => undefined;
      },
    };
    const said: number[] = [];

    watchEvents(log, new Date(0), () => undefined, { onPolling: (ms) => said.push(ms) })();

    expect(watched).toEqual([new Date(0)]);
    expect(said).toEqual([]);
  });
});
