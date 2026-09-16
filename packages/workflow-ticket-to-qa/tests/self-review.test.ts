import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "@amykit/plugin-file-store";
import { InMemoryStore, WORKDAY, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { Worker } from "@amykit/plugin-serial-engine";
import type { AskContext, BriefStore, Tracker } from "@amykit/core";
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
  return {
    agent: {
      triage: vi.fn(async () => ({
        value: { clear: true, questions: [], askedQuestions: [], at: at() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      })),
      implement: vi.fn(async () => ({
        value: { ok: true, output: "implemented", at: at() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      })),
      addressThreads: vi.fn(async () => ({ value: [], run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } })),
      ask: vi.fn(async (prompt: string, _cwd: string, context?: AskContext) => {
        seen.push({ prompt, context });
        return {
          text: "look at the boundary first",
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
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

async function driveToSelfReview(
  overrides: { tracker: Tracker; agent: unknown; briefs?: BriefStore; gate?: unknown },
  ticks = 8,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-self-review-"));
  const queue = new (await import("@amykit/plugin-file-queue")).FileQueue(path.join(root, "queue"));
  const records = new InMemoryStore();
  queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

  // A clock that moves: the machine decides what is "current" by comparing
  // timestamps, so a frozen one makes a green gate look older than the
  // implementation it checked and the ticket never leaves CHECKED.
  let at = clock.getTime();
  const worker = new Worker({
    queue,
    records,
    // The drive needs the machine to reach the gate green, which the fake
    // gate says on the first run, and the fixture's ticket worker deps hold
    // the same defaults every other runtime test drives with.
    ...ticketWorkerDeps({
      tracker: overrides.tracker,
      agent: overrides.agent as never,
      briefs: overrides.briefs,
      gate: overrides.gate as never,
      now: () => new Date((at += 1000)),
    }),
  });
  for (let look = 0; look < ticks; look += 1) await worker.tick();

  return { record: records.records.get("PROJ-1239"), root };
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
    void briefs.write({
      id: "invoice-currency",
      sections: [{ name: "Goal", body: "One currency on every invoice line." }],
      explains: ["PROJ-1239"],
      at: clock.toISOString(),
    });

    const withBrief = (): Ticket => ({ ...ticket(), briefId: "invoice-currency" });
    const { record } = await driveToSelfReview(
      { tracker: trackerFor(withBrief), agent, briefs, gate: { run: async () => ({ ok: true, output: "", at: next() }) } },
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