import { describe, it, expect } from "vitest";
import { Note } from "../src/ports/Notes.js";
import { branchFor, planPathFor, pullRequestBody, pullRequestTitle, slugFor } from "../src/plan-file.js";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-20260904T200000000",
    repo: "acme/widgets",
    text: "the linear adapter reports a status category where it promised a name",
    source: "somebody at a keyboard",
    writtenAt: "2026-09-04T20:00:00.000Z",
    ...overrides,
  };
}

describe("naming a plan", () => {
  it("takes the name from the note, because no tracker owns a slug here", () => {
    expect(slugFor(note())).toBe("the-linear-adapter-reports-a-status-category-where");
  });

  it("gives the same note the same name every time it is asked", () => {
    // A retry has to rewrite the draft it started rather than leaving a trail
    // of near-identical files behind, so this cannot involve a clock or a
    // random suffix.
    expect(slugFor(note())).toBe(slugFor(note()));
  });

  it("drops punctuation a branch name could not carry", () => {
    expect(slugFor(note({ text: "`sf check` fails: it can't find plans/" }))).toBe(
      "sf-check-fails-it-can-t-find-plans",
    );
  });

  it("falls back to the id when the note is all punctuation", () => {
    const nameless = note({ text: "???", id: "note-1" });

    expect(slugFor(nameless)).toBe("note-note-1");
  });

  it("puts the plan where that repository keeps its plans", () => {
    expect(planPathFor("a-slug")).toBe("plans/a-slug.md");
  });

  it("puts the branch under a prefix that says who wrote it", () => {
    expect(branchFor("a-slug")).toBe("amy/plan-a-slug");
  });

  it("titles the pull request in the repository's own words", () => {
    expect(pullRequestTitle("the-check-is-red")).toBe("docs(plans): the check is red");
  });
});

describe("what the pull request says for itself", () => {
  it("names the friction it came from, verbatim", () => {
    const body = pullRequestBody(note(), "a-slug");

    expect(body).toContain(
      "> the linear adapter reports a status category where it promised a name",
    );
  });

  it("names who noticed and when, because no ticket carries that here", () => {
    const body = pullRequestBody(note({ source: "a tick that failed in CHECKED" }), "a-slug");

    expect(body).toContain("Noted by a tick that failed in CHECKED on 2026-09-04T20:00:00.000Z");
  });

  it("says which two files it adds, so a reader knows what to look at", () => {
    const body = pullRequestBody(note(), "a-slug");

    expect(body).toContain("plans/a-slug.md");
    expect(body).toContain("plans/next-steps.md");
  });

  it("says that merging it is the decision, not the writing of it", () => {
    expect(pullRequestBody(note(), "a-slug")).toContain("nothing here has decided that");
  });
});
