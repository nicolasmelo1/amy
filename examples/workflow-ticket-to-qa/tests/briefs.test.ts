import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "@amykit/plugin-file-store";
import { InMemoryStore, WORKDAY, fakeAgent, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { Worker } from "@amykit/plugin-serial-engine";
import type { Agent, BriefStore, Conversation, Tracker } from "@amykit/core";
import type { Ticket } from "../src/ticket.js";

const clock = new Date(WORKDAY);

/**
 * A brief store in a scratch directory, with one brief the tickets below
 * share — the shape a grooming workflow leaves behind.
 */
async function briefStoreWith(root: string): Promise<BriefStore> {
  const store = new FileBriefStore(path.join(root, "briefs"));
  // Awaited: a write takes the brief's lock, so it is not done when it returns.
  await store.write({
    id: "invoice-currency",
    sections: [{ name: "Goal", body: "One currency on every invoice line." }],
    explains: ["PROJ-1239"],
    at: clock.toISOString(),
  });
  return store;
}

/**
 * The same store with one brief the unit itself owns: a project grooms a
 * brief per unit under that unit's id, and its GROOMED gate judges that one.
 */
async function briefStoreWithOwn(root: string): Promise<BriefStore> {
  const store = await briefStoreWith(root);
  await store.write({
    id: "PROJ-1239",
    sections: [{ name: "Goal", body: "The total is the sum of the lines, in one currency." }],
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
  overrides: { tracker: Tracker; agent?: Agent; briefs?: BriefStore; conversation?: Conversation },
  times = 2,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-runtime-"));
  const queue = new (await import("@amykit/plugin-file-queue")).FileQueue(path.join(root, "queue"));
  const records = new InMemoryStore();
  queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

  const worker = new Worker({
    queue,
    records,
    ...(await ticketWorkerDeps({
      tracker: overrides.tracker,
      agent: overrides.agent,
      briefs: overrides.briefs,
      conversation: overrides.conversation,
      now: () => clock,
    })),
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

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return {
          value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-store-"));
    const { record } = await drive({ tracker, agent, briefs: await briefStoreWith(root) });
    fs.rmSync(root, { recursive: true, force: true });

    // The brief reached the agent as the current rendered text, in the
    // prompt the triage was asked with.
    expect(seen[0]).toContain("One currency on every invoice line.");
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
    const briefs = await briefStoreWith(root);

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return {
          value: { clear: false, questions: ["Which currency?"], askedQuestions: ["Which currency?"], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    });

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
    const briefs = await briefStoreWith(root);

    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue({
        value: { clear: false, questions: ["Which currency for the total?"], askedQuestions: ["Which currency for the total?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    });

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
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue({
        value: { clear: false, questions: ["Does write-off count?"], askedQuestions: ["Does write-off count?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    });

    await drive({ tracker, agent, briefs: await briefStoreWith(root) }, 2);
    fs.rmSync(root, { recursive: true, force: true });

    expect(comment).toHaveBeenCalledWith("PROJ-1239", "- Does write-off count?");
    const briefs = new FileBriefStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-never-")), "briefs"));
    expect(await briefs.get("invoice-currency")).toBeNull();
  });

  it("asks and resumes in this work's conversation without commenting on the tracker", async () => {
    const comment = vi.fn<Tracker["comment"]>().mockResolvedValue(undefined);
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([ticket()]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(ticket()),
      comment,
      comments: vi.fn<Tracker["comments"]>().mockResolvedValue([]),
      hasReplyAfter: vi.fn<Tracker["hasReplyAfter"]>().mockResolvedValue(false),
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;
    const thread = { id: "conversation-PROJ-1239" };
    const open = vi.fn<Conversation["open"]>().mockResolvedValue(thread);
    const post = vi.fn<Conversation["post"]>().mockResolvedValue("message-1");
    const replies = vi.fn<Conversation["replies"]>().mockResolvedValue([
      {
        author: "Nico",
        text: "Use EUR.",
        files: ["/tmp/rates.csv"],
        at: new Date(clock.getTime() + 1).toISOString(),
      },
    ]);
    const conversation: Conversation = { known: async (workId) => open(workId, ""), open, post, replies };
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue({
        value: { clear: false, questions: ["Which currency?"], askedQuestions: ["Which currency?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    });

    const { record, root } = await drive({ tracker, agent, conversation }, 3);
    fs.rmSync(root, { recursive: true, force: true });

    expect(open).toHaveBeenCalledWith("PROJ-1239", "The total is wrong on the invoice");
    expect(post).toHaveBeenCalledWith(thread, { text: "- Which currency?" });
    expect(comment).not.toHaveBeenCalled();
    expect(tracker.comments).not.toHaveBeenCalled();
    expect(replies).toHaveBeenCalledWith(thread, clock.toISOString());
    expect(record?.state).toBe("READY");
  });

  it("reads the brief stored under the ticket's own id, ahead of the one its parent names", async () => {
    const own = { ...ticket(), briefId: "invoice-currency" };
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([own]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(own),
      comment: async () => {},
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return {
          value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-own-"));
    const briefs = await briefStoreWithOwn(root);
    const { record } = await drive({ tracker, agent, briefs });
    fs.rmSync(root, { recursive: true, force: true });

    // What the project groomed for this unit is what triage reads: the
    // parent's feature-level statement is not folded over it.
    expect(seen[0]).toContain("The total is the sum of the lines, in one currency.");
    expect(seen[0]).not.toContain("One currency on every invoice line.");
    expect(record?.state).toBe("READY");
  });

  it("reads the ticket's own brief when the tracker names no parent", async () => {
    const own = ticket();
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([own]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(own),
      comment: async () => {},
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return {
          value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() },
          run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
        };
      }),
    });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-own-unlinked-"));
    const { record } = await drive({ tracker, agent, briefs: await briefStoreWithOwn(root) });
    fs.rmSync(root, { recursive: true, force: true });

    expect(seen[0]).toContain("The total is the sum of the lines, in one currency.");
    expect(record?.state).toBe("READY");
  });

  it("appends triage's question to the ticket's own brief, not the parent's", async () => {
    const own = { ...ticket(), briefId: "invoice-currency" };
    const tracker = {
      inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([own]),
      get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(own),
      comment: vi.fn<Tracker["comment"]>().mockResolvedValue(undefined),
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "PROJ-9999",
    } as unknown as Tracker;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-own-append-"));
    const briefs = await briefStoreWithOwn(root);
    const agent = fakeAgent({
      triage: vi.fn().mockResolvedValue({
        value: { clear: false, questions: ["Which currency for the total?"], askedQuestions: ["Which currency for the total?"], at: clock.toISOString() },
        run: { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" },
      }),
    });

    await drive({ tracker, agent, briefs }, 2);

    const unit = await briefs.get("PROJ-1239");
    const parent = await briefs.get("invoice-currency");
    fs.rmSync(root, { recursive: true, force: true });

    // The question lands where the answer will be written: the brief the
    // ticket was read with, which is its own.
    expect(unit?.questions).toEqual([
      { workId: "PROJ-1239", question: "Which currency for the total?", at: clock.toISOString() },
    ]);
    expect(parent?.questions).toEqual([]);
  });
});