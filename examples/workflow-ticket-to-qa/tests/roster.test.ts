import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isConfirmedFor, isWorkday, leastLoadedReviewer, loadRoster } from "../src/roster.js";
import { WEEKEND, WORKDAY, roster } from "@amykit/test-fixtures";

describe("loadRoster", () => {
  it("says where to write one when this profile has none and the machine has none", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
    const profile = path.join(home, "tickets");
    fs.mkdirSync(profile, { recursive: true });

    expect(() => loadRoster(profile)).toThrow(/no roster at .*; write one with amy init/);

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("names the team the machine kept at its root when this profile has none", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
    const profile = path.join(home, "tickets");
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(home, "roster.yaml.moved"), "the old team\n", "utf-8");

    try {
      expect(() => loadRoster(profile)).toThrow(/the machine's old roster is .*roster\.yaml\.moved — copy it here/);
      expect(() => loadRoster(profile)).not.toThrow(/write one with amy init/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("names the machine's copy for a phase profile, whose parent is not the machine", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
    try {
      // A project phase's state sits several levels deep, and its parent directories are
      // the project's, not the machine's: the recovery that guessed from dirname
      // would look beside the phase and never see the file the machine kept.
      const state = path.join(home, "projects", "abc", "tickets", "morning");
      fs.mkdirSync(state, { recursive: true });
      fs.writeFileSync(path.join(home, "roster.yaml.moved"), "the old team\n", "utf-8");

      expect(() => loadRoster(state, home)).toThrow(/roster\.yaml\.moved — copy it here/);
      try {
        loadRoster(state, home);
        expect.unreachable("the absence of a roster is a throw, and the throw names the machine's copy");
      } catch (error) {
        expect(error instanceof Error && error.message.includes(path.join(home, "roster.yaml.moved"))).toBe(true);
      }
      expect(() => loadRoster(state)).toThrow(/write one with amy init/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

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
