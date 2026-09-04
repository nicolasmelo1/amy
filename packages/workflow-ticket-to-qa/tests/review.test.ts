import { describe, it, expect } from "vitest";
import {
  automatedReviewerSawHead,
  hasReviewedHead,
  isAutomatedReviewer,
  unresolvedThreads,
} from "../src/review.js";
import { HEAD, OLD_HEAD, botReview, pullRequest, review, thread } from "@amy/test-fixtures";

describe("isAutomatedReviewer", () => {
  // The same bot answers to three names depending on which API you ask, and
  // getting this wrong means either waiting forever or skipping the wait.
  it.each([
    "copilot-pull-request-reviewer[bot]",
    "copilot-pull-request-reviewer",
    "Copilot",
  ])("recognises %s", (login) => {
    expect(isAutomatedReviewer(login)).toBe(true);
  });

  it.each(["edsger", "ada", "alan"])("does not claim %s", (login) => {
    expect(isAutomatedReviewer(login)).toBe(false);
  });
});

describe("unresolvedThreads", () => {
  const pr = pullRequest({
    threads: [
      thread({ id: "H1", author: "edsger" }),
      thread({ id: "H2", author: "edsger", isResolved: true }),
      thread({ id: "B1", author: "copilot-pull-request-reviewer" }),
      thread({ id: "B2", author: "Copilot", isResolved: true }),
    ],
  });

  it("separates the bot's open threads from the humans'", () => {
    expect(unresolvedThreads(pr, "automated").map((t) => t.id)).toEqual(["B1"]);
    expect(unresolvedThreads(pr, "human").map((t) => t.id)).toEqual(["H1"]);
  });

  it("keeps an outdated thread, since outdated is not answered", () => {
    const outdated = pullRequest({
      threads: [thread({ id: "H1", isOutdated: true, author: "edsger" })],
    });

    expect(unresolvedThreads(outdated, "human")).toHaveLength(1);
  });
});

describe("hasReviewedHead", () => {
  it("only counts a review submitted against the current head", () => {
    const pr = pullRequest({ reviews: [review({ commitSha: OLD_HEAD })] });

    expect(hasReviewedHead(pr, "ada")).toBe(false);
    expect(hasReviewedHead(pullRequest({ reviews: [review()] }), "ada")).toBe(true);
  });

  it("does not care how the login is cased", () => {
    expect(hasReviewedHead(pullRequest({ reviews: [review()] }), "AdA")).toBe(true);
  });
});

describe("automatedReviewerSawHead", () => {
  it("is true for an empty review on the current head", () => {
    // The bot posts a COMMENTED review even with nothing to say, so this is
    // the only reliable signal that it has finished looking.
    expect(automatedReviewerSawHead(pullRequest({ reviews: [botReview(HEAD)] }))).toBe(true);
  });

  it("is false once a push moves the head", () => {
    expect(automatedReviewerSawHead(pullRequest({ reviews: [botReview(OLD_HEAD)] }))).toBe(false);
  });

  it("is false when only humans have reviewed", () => {
    expect(automatedReviewerSawHead(pullRequest({ reviews: [review()] }))).toBe(false);
  });
});
