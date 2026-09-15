import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "@amykit/plugin-file-store";
import { InMemoryStore, WORKDAY, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { Worker } from "@amykit/plugin-serial-engine";
import type { Agent, BriefStore, Tracker } from "@amykit/core";
import type { Ticket } from "../src/ticket.js";

const clock = new Date(WORKDAY);

/**
 * A brief store in a scratch directory, with one brief the tickets below
 * share — the shape a grooming workflow leaves behind.
 */
function briefStoreWith(root: string): BriefStore {
  const store = new FileBriefStore(path.join(root, "briefs"));
  void store.write({
    id: "invoice-currency",
    sections: [{ name: "Goal", body: "One currency on every invoice line." }],
    explains: ["PROJ-1239"],
    at: clock.toISOString(),
  });
  return store;
}

/** The ticket as the tracker holds it, referencing the brief it belongs to. */
function ticketWithBrief(): Ticket {
  return { ...ticket(), briefId: "invoice-currency" };
}

async function drive(
  overrides: { tracker: Tracker; agent?: Agent; briefs?: BriefStore },
  times = 2,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-runtime-"));
  const queue = new (await import("@amykit/plugin-file-queue")).FileQueue(path.join(root, "queue"));
  const records = new InMemoryStore();
  queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

  const worker = new Worker({
    queue,
    records,
    ...ticketWorkerDeps({ tracker: overrides.tracker, agent: overrides.agent, briefs: overrides.briefs, now: () => clock }),
  });
  for (let look = 0; look < times; look += 1) await worker.tick();

  return { record: records.records.get("PROJ-1239"), root };
}

describe("a runtime whose tickets carry a brief", () => {
  it("resolves the brief the ticket references into the observation the agent reads", async () => {
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([ticketWithBrief()]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(ticketWithBrief()),
      comment: async () => {},
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const seen: Ticket[] = [];
    const agent = {
      triage: vi.fn<Agent["triage"]>().mockImplementation(async (read: Ticket) => {
        seen.push(read);
        return {
          value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    } as unknown as Agent;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-store-"));
    const { record } = await drive({ tracker, agent, briefs: briefStoreWith(root) });
    fs.rmSync(root, { recursive: true, force: true });

    // The brief reached the agent as the current rendered text, and the
    // ticket the machine read carried it beside the body.
    expect(seen[0]?.brief).toContain("One currency on every invoice line.");
    expect(record?.state).toBe("READY");
  });

  it("reads the revision the brief is at now, not a copy from the first look", async () => {
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([ticketWithBrief()]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(ticketWithBrief()),
      comment: async () => {},
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-rev-"));
    const briefs = briefStoreWith(root);

    const seen: string[] = [];
    const agent = {
      triage: vi.fn<Agent["triage"]>().mockImplementation(async (read: Ticket) => {
        seen.push(read.brief ?? "");
        return {
          value: { clear: false, questions: ["Which currency?"], askedQuestions: ["Which currency?"], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    } as unknown as Agent;

    await drive({ tracker, agent, briefs }, 1);

    // The grooming workflow revises the brief between two looks. The second
    // tick must read the revision, never a copy folded into the record.
    await briefs.write({
      id: "invoice-currency",
      sections: [{ name: "Goal", body: "One currency, and the total rounds to cents." }],
      explains: ["PROJ-1239"],
      at: new Date(clock.getTime() + 1000).toISOString(),
    });

    await drive({ tracker, agent, briefs }, 1);
    fs.rmSync(root, { recursive: true, force: true });

    expect(seen[0]).toContain("One currency on every invoice line.");
    expect(seen.at(-1)).toContain("the total rounds to cents");
  });

  it("appends the question it asked to the brief, with its work id and time", async () => {
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([ticketWithBrief()]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(ticketWithBrief()),
      comment: vi.fn<Tracker["comment"]>().mockResolvedValue(undefined),
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-append-"));
    const briefs = briefStoreWith(root);

    const agent = {
      triage: vi.fn<Agent["triage"]>().mockResolvedValue({
        value: { clear: false, questions: ["Which currency for the total?"], askedQuestions: ["Which currency for the total?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    } as unknown as Agent;

    await drive({ tracker, agent, briefs }, 2);

    const brief = await briefs.get("invoice-currency");
    fs.rmSync(root, { recursive: true, force: true });

    // The question is in the brief, attributed to the ticket that asked it,
    // which is what the next sibling will read.
    expect(brief?.questions).toEqual([
      { workId: "PROJ-1239", question: "Which currency for the total?", at: clock.toISOString() },
    ]);
    // An append is not a revision: the sections are the owning workflow's.
    expect(brief?.revision).toBe(1);
  });

  it("asks its question on the tracker exactly as before when no brief is referenced", async () => {
    const comment = vi.fn<Tracker["comment"]>().mockResolvedValue(undefined);
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([ticket()]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(ticket()),
      comment,
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-none-"));
    const agent = {
      triage: vi.fn<Agent["triage"]>().mockResolvedValue({
        value: { clear: false, questions: ["Does write-off count?"], askedQuestions: ["Does write-off count?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    } as unknown as Agent;

    await drive({ tracker, agent, briefs: briefStoreWith(root) }, 2);
    fs.rmSync(root, { recursive: true, force: true });

    expect(comment).toHaveBeenCalledWith("PROJ-1239", "- Does write-off count?");
    const briefs = new FileBriefStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-never-")), "briefs"));
    expect(await briefs.get("invoice-currency")).toBeNull();
  });
});