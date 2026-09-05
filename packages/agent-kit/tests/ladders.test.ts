import { describe, it, expect } from "vitest";
import { Ladders, everyRung, oneLadder, rungsFor } from "../src/ladders.js";
import { Rung } from "../src/ladder.js";

const rung = (name: string, harness = "claude", model = "sonnet"): Rung => ({
  name,
  harness,
  model,
});

const cheap = rung("claude:haiku", "claude", "haiku");
const middling = rung("claude:sonnet", "claude", "sonnet");
const dear = rung("claude:opus", "claude", "opus");

describe("oneLadder", () => {
  it("is what an install with a single ladder has", () => {
    const ladders = oneLadder([middling, dear]);

    expect(rungsFor(ladders, "triage")).toEqual([middling, dear]);
    expect(rungsFor(ladders, "implement")).toEqual([middling, dear]);
    expect(rungsFor(ladders)).toEqual([middling, dear]);
  });
});

describe("rungsFor", () => {
  const ladders: Ladders<Rung> = {
    fallback: [middling, dear],
    byStep: { triage: [cheap], implement: [dear] },
  };

  it("sends the cheap step to the cheap rung", () => {
    // The whole point: reading a ticket to decide whether it is clear is not
    // the same job as writing the change, and one ladder for both means
    // paying the expensive model to do the cheap step.
    expect(rungsFor(ladders, "triage")).toEqual([cheap]);
  });

  it("sends the expensive step to the expensive rung", () => {
    expect(rungsFor(ladders, "implement")).toEqual([dear]);
  });

  it("falls back for a step nobody named", () => {
    expect(rungsFor(ladders, "address-threads")).toEqual([middling, dear]);
  });

  it("falls back when there is no step at all", () => {
    expect(rungsFor(ladders)).toEqual([middling, dear]);
  });

  it("falls back rather than leaving a step with nowhere to go", () => {
    // An operator who wrote `triage: []` has said nothing about triage. The
    // alternative is a relay with an empty ladder, which the constructor
    // already refuses to be.
    const empty: Ladders<Rung> = { fallback: [middling], byStep: { triage: [] } };

    expect(rungsFor(empty, "triage")).toEqual([middling]);
  });
});

describe("everyRung", () => {
  it("reaches the rungs only a step can, so nothing goes unchecked", () => {
    // What a caller validating names has to see: a rung named only inside a
    // step's ladder is still a rung somebody has to have contributed.
    const ladders: Ladders<Rung> = { fallback: [middling], byStep: { triage: [cheap] } };

    expect(everyRung(ladders)).toEqual([middling, cheap]);
  });

  it("is empty only when nothing was contributed anywhere", () => {
    expect(everyRung({ fallback: [], byStep: {} })).toEqual([]);
    expect(everyRung({ fallback: [], byStep: { triage: [cheap] } })).toEqual([cheap]);
  });
});
