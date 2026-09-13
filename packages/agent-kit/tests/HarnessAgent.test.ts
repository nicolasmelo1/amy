import { describe, it, expect } from "vitest";
import { Git, HarnessReply, Harness } from "@amykit/core";
import { ScriptedRunner, ticket, thread } from "@amykit/test-fixtures";
import { HarnessAgent } from "../src/HarnessAgent.js";

/**
 * A harness that remembers the prompt, which is what these tests read.
 *
 * The prompts are the contract here: whatever a ticket carries has to reach
 * the one place the work is judged by, and what it says about a missing body
 * has to be said in words rather than by an absent line nobody can see.
 */
function agentWithBody(): { agent: HarnessAgent; prompts: string[] } {
  const prompts: string[] = [];

  const harness: Harness = {
    name: "fake",
    ask: async (prompt: string): Promise<HarnessReply> => {
      prompts.push(prompt);
      return {
        text: '{"clear": true}',
        run: {
          outcome: "completed",
          harness: "fake",
          model: "fake-1",
          durationMs: 10,
          costSource: "unknown",
          output: "",
        },
      };
    },
  };

  const git = new Git(new ScriptedRunner(), { workspaceRoot: "/w", defaultBranch: "main" });

  return { agent: new HarnessAgent(harness, git), prompts };
}

describe("HarnessAgent prompts", () => {
  it("carries the ticket's body into triage, where 'clear' is judged", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.triage(ticket({ body: "Consume the aggregate from TBO-1236 — do not rebuild the SUM." }));

    expect(prompts[0]).toContain("Consume the aggregate from TBO-1236 — do not rebuild the SUM.");
    expect(prompts[0]).toContain("Read enough of this repository to judge it");
  });

  it("never tells the agent to read a tracker page", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.triage(ticket());

    expect(prompts[0]).not.toContain("Read the ticket");
  });

  it("says a ticket with no body has none, in words, rather than looking truncated", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.triage(ticket({ body: undefined }));

    expect(prompts[0]).toContain("(this ticket has no description)");
  });

  it("carries the body into implement, where an ownership boundary reaches the work", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.implement(
      ticket({ body: "Named file: src/aggregate.ts. Do not rebuild the SUM here." }),
    );

    expect(prompts[0]).toContain("Named file: src/aggregate.ts. Do not rebuild the SUM here.");
  });

  it("carries the body into addressing review comments, so a boundary survives review", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.addressThreads(ticket({ body: "The rename is owned by TBO-1236." }), [], "human");

    expect(prompts[0]).toContain("The rename is owned by TBO-1236.");
  });

  it("shows the whole conversation inside a thread, attributed", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.addressThreads(
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

    const prompt = prompts[0] ?? "";

    // Every voice in the thread is named, in the order it spoke.
    expect(prompt).toContain("[T9] edsger said:");
    expect(prompt).toContain("  - edsger replied:");
    expect(prompt).toContain("  - amy-machine replied:");
    // The correction inside the thread is on the page the agent reads.
    expect(prompt).toContain("that still leaves the old one behind");
    // Oldest first: the correction the reviewer came back with sits after
    // the answer it corrects.
    expect(prompt.indexOf("inlined it in 4b2f1c")).toBeLessThan(
      prompt.indexOf("that still leaves the old one behind"),
    );
  });

  it("never presents a reply as part of the original objection", async () => {
    const { agent, prompts } = agentWithBody();

    await agent.addressThreads(
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

    const prompt = prompts[0] ?? "";

    // The opening comment is what the thread said; the reply is marked as a
    // reply, so a correction of the thread's own claim is never read as the
    // objection it started with.
    expect(prompt).toContain("[T9] edsger said:\nexternal_invoice_id is free-form\n");
    expect(prompt).toContain("  - edsger replied:\ncorrection: it must stay in the form the API returns");
    // A reply is introduced as a reply, and the prompt says a later comment
    // answers the earlier ones rather than restating the objection.
    expect(prompt).toContain("A later comment in a thread answers the earlier ones");
  });
});