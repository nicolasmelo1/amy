import { describe, it, expect } from "vitest";
import { isConfirmedFor, isWorkday, leastLoadedReviewer } from "../src/roster.js";
import { WEEKEND, WORKDAY, roster } from "@amykit/test-fixtures";

describe("isWorkday", () => {
  it.each([
    ["2026-08-31", true],
    ["2026-09-03", true],
    ["2026-09-04", true],
    ["2026-09-05", false],
    ["2026-09-06", false],
  ])("%s is a workday: %s", (date, expected) => {
    expect(isWorkday(new Date(`${date}T12:00:00.000Z`))).toBe(expected);
  });
});

describe("isConfirmedFor", () => {
  it("requires today's confirmation on a workday", () => {
    expect(isConfirmedFor(roster({ confirmedOn: "2026-09-03" }), WORKDAY)).toBe(true);
    expect(isConfirmedFor(roster({ confirmedOn: "2026-09-02" }), WORKDAY)).toBe(false);
  });

  it("does not ask at the weekend, since nobody is there to answer", () => {
    expect(isConfirmedFor(roster({ confirmedOn: "2026-08-01" }), WEEKEND)).toBe(true);
  });
});

describe("leastLoadedReviewer", () => {
  it("picks the lightest load", () => {
    const picked = leastLoadedReviewer(roster(), {
      "ada": 5,
      alan: 1,
      edsger: 3,
    });

    expect(picked?.host).toBe("alan");
  });

  it("treats an absent count as no open reviews", () => {
    expect(leastLoadedReviewer(roster(), { edsger: 1 })?.host).toBe("ada");
  });

  it("breaks a tie on the login, so the pick is reproducible", () => {
    const load = { "ada": 4, alan: 4, edsger: 4 };

    expect(leastLoadedReviewer(roster(), load)?.host).toBe("ada");
  });

  it("skips whoever is away", () => {
    const away = roster({
      reviewers: [
        { tracker: "a@x", host: "alan", available: false },
        { tracker: "b@x", host: "edsger", available: true },
      ],
    });

    expect(leastLoadedReviewer(away, { alan: 0, edsger: 9 })?.host).toBe("edsger");
  });

  it("honours an explicit exclusion", () => {
    const load = { "ada": 0, alan: 1, edsger: 2 };

    expect(leastLoadedReviewer(roster(), load, ["ada"])?.host).toBe("alan");
  });

  it("returns nobody when the whole roster is away", () => {
    const away = roster({ reviewers: [{ tracker: "a@x", host: "edsger", available: false }] });

    expect(leastLoadedReviewer(away, {})).toBeNull();
  });
});
