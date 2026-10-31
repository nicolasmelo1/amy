import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "@amykit/plugin-file-store";
import { WORKDAY, ticket } from "@amykit/test-fixtures";
import type { AskContext, BriefStore, Tracker } from "@amykit/core";
import { drive, mountedTicket } from "./mounted.js";
import { reviewVerdict } from "../src/lanes.js";
import type { Ticket } from "../src/ticket.js";

const clock = new Date(WORKDAY);

/**
 * The relay's port at both levels, as the runtime sees it: the ticket-shaped
 * half answers as the fixture's fake does, and `ask` records what it was
 * asked — the prompt and the context — so the test reads exactly what the
 * half-step sent. The timestamps move with the drive's clock, because the
 * machine decides what is "current" by comparing them.
 */
function recordingAgent(
  seen: { prompt: string; context?: AskContext }[],
  at: () => string,
): {
  agent: unknown;
} {
  const run = { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } as const;
  return {
    // Only `ask`, as the real agent: every step is recorded, triage answers
    // the JSON its prompt asks for, and every other step answers in words.
    agent: {
      ask: vi.fn(async (prompt: string, _cwd: string, context?: AskContext) => {
        seen.push({ prompt, context });
        at();
        if (context?.step === "triage") return { text: '{"clear": true}', run };
        if (context?.step === "address-threads") return { text: '{"verdicts": []}', run };
        return { text: "look at the boundary first", run };
      }),
    },
  };

}

const trackerFor = (read: () => Ticket): Tracker =>
  ({
    inProgress: vi.fn(async () => [read()]),
    get: vi.fn(async () => read()),
    comment: vi.fn(async () => {}),
    comments: vi.fn(async () => []),
    hasReplyAfter: vi.fn(async () => true),
    setStatus: vi.fn(async () => {}),
    assign: vi.fn(async () => {}),
    createFollowUp: vi.fn(async () => "PROJ-9999"),
  }) as unknown as Tracker;

/**
 * Drives the mounted workflow until both checks have met at the verdict: the
 * self-review is a lane of `checks` now, which only exists once composed.
 */
async function driveToSelfReview(overrides: { tracker: Tracker; agent: unknown; briefs?: BriefStore; gate?: unknown; now?: () => Date }) {
  let at = clock.getTime();
  const now = overrides.now ?? (() => new Date((at += 1000)));
  const mounted = await mountedTicket({ tracker: overrides.tracker, agent: overrides.agent as object, gate: overrides.gate as object, brief: overrides.briefs }, now);
  const record = await drive(mounted, mounted.runtime.newRecord("PROJ-1239", now()), now, (current) => current.lastSelfReview !== undefined);
  return { record };
}

describe("the self-review half-step", () => {
  it("asks the agent to review the change with the brief in the prompt and in the context", async () => {
    const seen: { prompt: string; context?: AskContext }[] = [];
    // The drive's clock, shared with the fakes below: the machine compares
    // timestamps to decide what is current, so every `at` moves with it.
    let at = clock.getTime();
    const next = (): string => new Date((at += 1000)).toISOString();
    const { agent } = recordingAgent(seen, next);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-self-review-brief-"));
    const briefs = new FileBriefStore(path.join(root, "briefs"));
    await briefs.write({
      id: "invoice-currency",
      sections: [{ name: "Goal", body: "One currency on every invoice line." }],
      explains: ["PROJ-1239"],
      at: clock.toISOString(),
    });

    const withBrief = (): Ticket => ({ ...ticket(), briefId: "invoice-currency" });
    const { record } = await driveToSelfReview(
      { tracker: trackerFor(withBrief), agent, briefs, gate: { run: async () => ({ ok: true, output: "", at: next() }) }, now: () => new Date(next()) },
    );
    fs.rmSync(root, { recursive: true, force: true });

    const ask = seen.find((entry) => entry.context?.step === "self-review");
    expect(ask).toBeDefined();
    // The prompt names the ticket and carries the brief beside the question,
    // so the review reads the change against what the work was for.
    expect(ask?.prompt).toContain("PROJ-1239");
    expect(ask?.prompt).toContain("One currency on every invoice line.");
    // And the context carries the same brief, which is how a skill named for
    // this step answers with it without the workflow's vocabulary leaking.
    expect(ask?.context?.brief).toContain("One currency on every invoice line.");
    // The half-step passed: the record holds what the review said.
    expect(record?.lastSelfReview?.ok).toBe(true);
    expect(record?.lastSelfReview?.output).toContain("look at the boundary first");
  });

  it("asks the same question without the brief when the ticket carries none", async () => {
    const seen: { prompt: string; context?: AskContext }[] = [];
    // The same moving clock as its sibling test, for the same reason.
    let at = clock.getTime();
    const next = (): string => new Date((at += 1000)).toISOString();
    const { agent } = recordingAgent(seen, next);

    const { record } = await driveToSelfReview({
      tracker: trackerFor(() => ticket()),
      agent,
      gate: { run: async () => ({ ok: true, output: "", at: next() }) },
      now: () => new Date(next()),
    });
    const ask = seen.find((entry) => entry.context?.step === "self-review");

    expect(ask).toBeDefined();
    // No brief, no mention: the prompt is the question and nothing else,
    // which is what an install without briefs has always run.
    expect(ask?.prompt).not.toContain("The current brief");
    expect(ask?.context?.brief).toBeUndefined();
    expect(record?.lastSelfReview?.ok).toBe(true);
  });
});
describe("the verdict a review ends on", () => {
  it.each([
    ["a line saying CHANGES_ASKED", "the total rounds twice\nCHANGES_ASKED: round once", "CHANGES_ASKED"],
    ["a verdict line saying it", "Verdict: CHANGES_ASKED", "CHANGES_ASKED"],
    ["APPROVED", "looks right\nAPPROVED", "APPROVED"],
    ["no verdict at all, which every review was before it could say one", "look at the boundary first", "APPROVED"],
    ["the words in the middle of a sentence", "nothing here is CHANGES_ASKED worthy", "APPROVED"],
  ] as const)("reads %s", (_name, text, verdict) => {
    expect(reviewVerdict(text)).toBe(verdict);
  });
});

describe("a self-review that did not finish", () => {
  const agentThat = (outcome: "rate-limited" | "failed") => ({
    ask: vi.fn(async (_prompt: string, _cwd: string, context?: AskContext) => {
      const run = { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } as const;
      if (context?.step === "triage") return { text: '{"clear": true}', run };
      if (context?.step === "self-review") return { text: "", run: { ...run, outcome } };
      return { text: "done", run };
    }),
  });

  it("never approves the change when it ran out of quota: it waits, and it was not a try", async () => {
    let at = clock.getTime();
    const now = () => new Date((at += 1000));
    const mounted = await mountedTicket({ tracker: trackerFor(() => ticket()), agent: agentThat("rate-limited") }, now);

    const record = await drive(mounted, mounted.runtime.newRecord("PROJ-1239", now()), now, (current) => current.state === "verdict", 20);

    expect(record.state).toBe("checks");
    expect(record.lastSelfReview).toBeUndefined();
    const review = record.calls![`PROJ-1239/SELF_REVIEW#1`]!;
    expect(review.state).toBe("REVIEWING");
    expect(review.attempts.REVIEWING ?? 0).toBe(0);
  });

  it("fails the look when it did not complete for any other reason", async () => {
    let at = clock.getTime();
    const now = () => new Date((at += 1000));
    const mounted = await mountedTicket({ tracker: trackerFor(() => ticket()), agent: agentThat("failed") }, now);

    await expect(drive(mounted, mounted.runtime.newRecord("PROJ-1239", now()), now, (current) => current.state === "verdict", 20))
      .rejects.toThrow(/self-review did not complete: failed on fake/);
  });
});
