import { describe, expect, it } from "vitest";
import { thread, ticket } from "@amykit/test-fixtures";
import {
  branchOf,
  implementPrompt,
  readTriage,
  readVerdicts,
  threadPrompt,
  triagePrompt,
} from "../src/agent-steps.js";

/**
 * The prompts are the contract here: whatever a ticket carries has to reach
 * the one place the work is judged by, and what it says about a missing body
 * has to be said in words rather than by an absent line nobody can see.
 */
describe("ticket-to-qa's prompts", () => {
  it("carries the ticket's body into triage, where 'clear' is judged", () => {
    const prompt = triagePrompt(ticket({ body: "Consume the aggregate from TBO-1236 — do not rebuild the SUM." }));

    expect(prompt).toContain("Consume the aggregate from TBO-1236 — do not rebuild the SUM.");
    expect(prompt).toContain("Read enough of this repository to judge it");
  });

  it("never tells the agent to read a tracker page", () => {
    expect(triagePrompt(ticket())).not.toContain("Read the ticket");
  });

  it("says a ticket with no body has none, in words, rather than looking truncated", () => {
    expect(triagePrompt(ticket({ body: undefined }))).toContain("(this ticket has no description)");
  });

  it("carries the body into implement, where an ownership boundary reaches the work", () => {
    const prompt = implementPrompt(ticket({ body: "Named file: src/aggregate.ts. Do not rebuild the SUM here." }));

    expect(prompt).toContain("Named file: src/aggregate.ts. Do not rebuild the SUM here.");
  });

  it("carries the body into addressing review comments, so a boundary survives review", () => {
    expect(threadPrompt(ticket({ body: "The rename is owned by TBO-1236." }), [], "human")).toContain(
      "The rename is owned by TBO-1236.",
    );
  });

  it("carries the current brief into triage, above the body it explains", () => {
    const prompt = triagePrompt(
      ticket({
        brief: "Goal\nOne currency on every invoice line.\n\nQuestion (from PROJ-1238, 2026-09-02): Which currency for the total?",
        body: "The total line, only.",
      }),
    );

    expect(prompt).toContain("The current brief for the feature this ticket belongs to:");
    expect(prompt).toContain("One currency on every invoice line.");
    expect(prompt).toContain("Which currency for the total?");
    // Above the body: the brief is what the work is *for*, the body is the
    // slice of it this ticket takes.
    expect(prompt.indexOf("One currency")).toBeLessThan(prompt.indexOf("The total line, only."));
  });

  it("carries the current brief into implement, where it steers the change", () => {
    const prompt = implementPrompt(ticket({ brief: "Goal\nOne currency on every invoice line." }));

    expect(prompt).toContain("One currency on every invoice line.");
    expect(prompt).toContain("Answer for the brief as it stands above");
  });

  it("carries the current brief into addressing review comments", () => {
    expect(threadPrompt(ticket({ brief: "Goal\nOne currency on every invoice line." }), [], "human")).toContain(
      "One currency on every invoice line.",
    );
  });

  it("leaves a ticket with no brief with the prompt it has always had", () => {
    const prompt = triagePrompt(ticket({ body: "Consume the aggregate from TBO-1236." }));

    expect(prompt).not.toContain("current brief");
    expect(prompt).toContain("Consume the aggregate from TBO-1236.");
  });

  it("tells a retry what went wrong, verbatim", () => {
    expect(implementPrompt(ticket(), "lint: 3 problems")).toContain("lint: 3 problems");
  });

  it("shows the whole conversation inside a thread, attributed", () => {
    const prompt = threadPrompt(
      ticket(),
      [
        thread({
          id: "T9",
          author: "edsger",
          body: "external_invoice_id is free-form",
          comments: [
            { author: "edsger", body: "external_invoice_id is free-form", createdAt: "2026-09-03T10:00:00Z" },
            { author: "amy-machine", body: "inlined it in 4b2f1c", createdAt: "2026-09-03T11:00:00Z" },
            { author: "edsger", body: "that still leaves the old one behind", createdAt: "2026-09-03T12:00:00Z" },
          ],
        }),
      ],
      "human",
    );

    // Every voice in the thread is named, in the order it spoke.
    expect(prompt).toContain("[T9] edsger said:");
    expect(prompt).toContain("  - edsger replied:");
    expect(prompt).toContain("  - amy-machine replied:");
    expect(prompt).toContain("that still leaves the old one behind");
    expect(prompt.indexOf("inlined it in 4b2f1c")).toBeLessThan(prompt.indexOf("that still leaves the old one behind"));
  });

  it("never presents a reply as part of the original objection", () => {
    const prompt = threadPrompt(
      ticket(),
      [
        thread({
          id: "T9",
          author: "edsger",
          body: "external_invoice_id is free-form",
          comments: [
            { author: "edsger", body: "external_invoice_id is free-form", createdAt: "2026-09-03T10:00:00Z" },
            { author: "edsger", body: "correction: it must stay in the form the API returns", createdAt: "2026-09-03T11:00:00Z" },
          ],
        }),
      ],
      "human",
    );

    expect(prompt).toContain("[T9] edsger said:\nexternal_invoice_id is free-form\n");
    expect(prompt).toContain("  - edsger replied:\ncorrection: it must stay in the form the API returns");
    expect(prompt).toContain("A later comment in a thread answers the earlier ones");
  });

  it("adds a reviewer's hint when that reviewer is in the threads, and only then", () => {
    const hints = { edsger: "Delete anything that is not needed." };

    expect(threadPrompt(ticket(), [thread({ author: "Edsger" })], "human", hints)).toContain("- Delete anything that is not needed.");
    expect(threadPrompt(ticket(), [thread({ author: "grace" })], "human", hints)).not.toContain("Reviewer notes:");
  });
});

describe("reading ticket-to-qa's answers", () => {
  it("records the questions a triage asked, so they are never asked twice", () => {
    expect(readTriage({ clear: false, questions: ["which currency?"] }, "2026-09-03T12:00:00.000Z")).toEqual({
      clear: false,
      questions: ["which currency?"],
      askedQuestions: ["which currency?"],
      at: "2026-09-03T12:00:00.000Z",
    });
    expect(readTriage({ clear: true, questions: ["ignored"] }, "now")).toMatchObject({ clear: true, questions: [] });
  });

  it("sends a comment the agent did not answer to the owner rather than dropping it", () => {
    const verdicts = readVerdicts({ verdicts: [{ threadId: "T1", verdict: "fixed", note: "done" }] }, [
      thread({ id: "T1" }),
      thread({ id: "T2" }),
    ]);

    expect(verdicts).toEqual([
      { threadId: "T1", verdict: "fixed", note: "done" },
      { threadId: "T2", verdict: "disagreed", note: "the agent did not answer this comment" },
    ]);
  });

  it("refuses a ticket whose tracker derived no branch, naming the field", () => {
    expect(branchOf(ticket({ branchName: "ada/proj-1-x" }))).toBe("ada/proj-1-x");
    expect(() => branchOf(ticket({ id: "PROJ-9", branchName: undefined }))).toThrow(/PROJ-9 has no `branchName`/);
  });
});
