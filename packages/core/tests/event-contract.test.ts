import { describe, it, expect } from "vitest";
import { EVENT_KINDS, EventKind, checkEvent, eventContract, isEventKind } from "../src/index.js";

const AT = "2026-09-03T12:00:00.000Z";

/** A line that keeps the contract, so a case can break exactly one thing. */
function line(kind: EventKind, rest: Record<string, unknown> = {}) {
  return { at: AT, kind, workId: "PROJ-1239", state: "IMPLEMENTING", ...rest };
}

describe("the declared kinds and the union", () => {
  it("declares every kind the union carries", () => {
    const declared = Object.keys(eventContract().kinds).sort();
    expect(declared).toEqual(Object.keys(EVENT_KINDS).sort());
  });

  it("declares nothing the union has never heard of", () => {
    const unknown = Object.keys(eventContract().kinds).filter((kind) => !isEventKind(kind));
    expect(unknown).toEqual([]);
  });

  it("says what every kind means", () => {
    const silent = Object.entries(eventContract().kinds)
      .filter(([, of]) => of.says.trim() === "")
      .map(([kind]) => kind);
    expect(silent).toEqual([]);
  });

  it("carries a whole version number", () => {
    const { version } = eventContract();
    expect(Number.isInteger(version) && version > 0).toBe(true);
  });
});

describe("checkEvent", () => {
  it("passes a line that keeps the contract", () => {
    expect(checkEvent(line("work.settled"))).toEqual([]);
  });

  it("refuses a kind nobody declared", () => {
    const problems = checkEvent({ at: AT, kind: "banana" as EventKind });
    expect(problems.join("\n")).toContain("banana");
  });

  it("names a required top-level field that is missing", () => {
    const problems = checkEvent({ at: AT, kind: "work.settled", state: "READY" });
    expect(problems).toContain("work.settled: workId is required");
  });

  it("names a required detail field that is missing", () => {
    const problems = checkEvent(line("work.failed", { detail: { error: "died" } }));
    expect(problems).toContain("work.failed: detail.attempt is required");
  });

  it("names a detail field of the wrong type", () => {
    const problems = checkEvent(line("work.failed", { detail: { attempt: "1", error: "died" } }));
    expect(problems).toContain("work.failed: detail.attempt should be number, got string");
  });

  it("refuses a detail field nobody declared, so the file cannot rot", () => {
    const problems = checkEvent(
      line("work.settled", { detail: { somethingNew: "slipped in quietly" } }),
    );
    expect(problems).toContain("work.settled: detail.somethingNew is not declared in events.json");
  });

  it("lets an optional field be left out", () => {
    const problems = checkEvent(
      line("agent.run", {
        detail: { harness: "claude", outcome: "completed", durationMs: 10, costSource: "reported" },
      }),
    );
    expect(problems).toEqual([]);
  });

  it("reads null as absent, because JSON has no other way to say it", () => {
    expect(checkEvent(line("stop.enforced", { detail: { reason: null } }))).toEqual([]);
  });

  it("wants an instant on every line", () => {
    const problems = checkEvent({ kind: "run.idle" } as never);
    expect(problems).toContain("run.idle: at is required");
  });

  it("tells an array from an object, which typeof will not", () => {
    const problems = checkEvent(
      line("budget.parked", {
        detail: {
          window: "perFiveHours",
          measure: "costUsd",
          used: 19,
          limit: 20,
          stopAt: 0.9,
          retryAfterMs: 1000,
          pending: { implement: true },
        },
      }),
    );
    expect(problems).toContain("budget.parked: detail.pending should be array, got object");
  });
});
