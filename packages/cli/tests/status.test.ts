import { describe, expect, it } from "vitest";
import { recordsToShow, standing } from "../src/status-view.js";

const records = [
  { id: "A-1", state: "DONE" },
  { id: "A-2", state: "DISCOVERED" },
  { id: "A-3", state: "ESCALATED" },
];

const WAITING = ["ESCALATED", "DONE"];
const TERMINAL = ["DONE"];

describe("recordsToShow", () => {
  it("leaves work that is over out of the listing, and counts it", () => {
    const view = recordsToShow(records, TERMINAL, false);

    expect(view.shown.map((record) => record.id)).toEqual(["A-2", "A-3"]);
    expect(view.finished).toBe(1);
  });

  it("prints work that is over when it is asked for", () => {
    const view = recordsToShow(records, TERMINAL, true);

    expect(view.shown).toHaveLength(3);
    expect(view.finished).toBe(0);
  });

  it("hides nothing when the workflow would not mount", () => {
    const view = recordsToShow(records, undefined, false);

    expect(view.shown).toHaveLength(3);
    expect(view.finished).toBe(0);
  });

  it("counts nothing when no record has ended", () => {
    const view = recordsToShow(records, ["ABANDONED"], false);

    expect(view.shown).toHaveLength(3);
    expect(view.finished).toBe(0);
  });
});

describe("standing", () => {
  // The bug this is here for: `status` was handed the waiting states and not
  // the terminal ones, so a finished ticket was printed as `active`.
  it("calls a terminal record finished rather than active", () => {
    expect(standing("DONE", ["ESCALATED"], TERMINAL)).toBe("finished");
  });

  it("prefers finished over waiting when a state is declared both", () => {
    expect(standing("DONE", WAITING, TERMINAL)).toBe("finished");
  });

  it("calls a waiting state waiting, and everything else active", () => {
    expect(standing("ESCALATED", WAITING, TERMINAL)).toBe("waiting");
    expect(standing("DISCOVERED", WAITING, TERMINAL)).toBe("active");
  });

  it("says nothing it cannot know when the workflow would not mount", () => {
    expect(standing("DONE", undefined, undefined)).toBe("?");
  });
});
