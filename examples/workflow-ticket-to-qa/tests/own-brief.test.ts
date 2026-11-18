import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "@amykit/plugin-file-store";
import { FileQueue } from "@amykit/plugin-file-queue";
import { InMemoryStore, WORKDAY, fakeAgent, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { Worker } from "@amykit/plugin-serial-engine";
import type { Agent, BriefStore, Tracker } from "@amykit/core";
import type { Ticket } from "../src/ticket.js";

const clock = new Date(WORKDAY);
const OWN = "The total is the sum of the lines, in one currency.";
const PARENT = "One currency on every invoice line.";

const run = { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } as const;

function trackerOf(held: Ticket): Tracker {
  return {
    inProgress: vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([held]),
    get: vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(held),
    comment: vi.fn<Tracker["comment"]>().mockResolvedValue(undefined),
    comments: async () => [],
    hasReplyAfter: async () => false,
    setStatus: async () => {},
    assign: async () => {},
    createFollowUp: async () => "PROJ-9999",
  } as unknown as Tracker;
}

async function storeIn(root: string, briefs: Record<string, string>): Promise<FileBriefStore> {
  const store = new FileBriefStore(path.join(root, "briefs"));
  for (const [id, body] of Object.entries(briefs)) {
    await store.write({ id, sections: [{ name: "Goal", body }], explains: ["PROJ-1239"], at: clock.toISOString() });
  }
  return store;
}

async function drive(workId: string, deps: { tracker: Tracker; agent: Agent; briefs: BriefStore }, times = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-own-brief-queue-"));
  const queue = new FileQueue(path.join(root, "queue"));
  const records = new InMemoryStore();
  queue.enqueue({ workId, reason: "discovered" }, clock);
  const worker = new Worker({
    queue,
    records,
    ...(await ticketWorkerDeps({ tracker: deps.tracker, agent: deps.agent, briefs: deps.briefs, now: () => clock })),
  });
  for (let look = 0; look < times; look += 1) await worker.tick();
  fs.rmSync(root, { recursive: true, force: true });
  return records.records.get(workId);
}

describe("the brief a unit is worked against", () => {
  it("reads the brief stored under the unit's work id, the id the project's gate judged", async () => {
    // A ticket worked in one of several repositories is its own unit, and a
    // project walking it judges the brief under that work id.
    const workId = "PROJ-1239@acme%2Fapi";
    const held: Ticket = { ...ticket(), briefId: "invoice-currency", repos: [ticket().repo, "acme/api"] };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-own-brief-unit-"));
    const briefs = await storeIn(root, { [workId]: OWN, "invoice-currency": PARENT });

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return { value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() }, run };
      }),
    });

    await drive(workId, { tracker: trackerOf(held), agent, briefs });
    fs.rmSync(root, { recursive: true, force: true });

    expect(seen[0]).toContain(OWN);
    expect(seen[0]).not.toContain(PARENT);
  });

  it("appends triage's question to the brief the triage prompt was built from", async () => {
    // The unit's own brief appears while triage is running: the question was
    // asked against the parent's text, so that is where it belongs.
    const held: Ticket = { ...ticket(), briefId: "invoice-currency" };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-own-brief-race-"));
    const briefs = await storeIn(root, { "invoice-currency": PARENT });

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        await briefs.write({ id: "PROJ-1239", sections: [{ name: "Goal", body: OWN }], explains: ["PROJ-1239"], at: clock.toISOString() });
        return { value: { clear: false, questions: ["Which currency for the total?"], askedQuestions: ["Which currency for the total?"], at: clock.toISOString() }, run };
      }),
    });

    await drive("PROJ-1239", { tracker: trackerOf(held), agent, briefs }, 2);
    const parent = await briefs.get("invoice-currency");
    const own = await briefs.get("PROJ-1239");
    fs.rmSync(root, { recursive: true, force: true });

    expect(seen[0]).toContain(PARENT);
    expect(parent?.questions.map((one) => one.question)).toEqual(["Which currency for the total?"]);
    expect(own?.questions).toEqual([]);
  });

  it("does not present the unit's own brief to the agent as the feature's", async () => {
    const held: Ticket = { ...ticket(), briefId: "invoice-currency" };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-own-brief-label-"));
    const briefs = await storeIn(root, { "PROJ-1239": OWN, "invoice-currency": PARENT });

    const seen: string[] = [];
    const agent = fakeAgent({
      triage: vi.fn().mockImplementation(async (prompt: string) => {
        seen.push(prompt);
        return { value: { clear: true, questions: [], askedQuestions: [], at: clock.toISOString() }, run };
      }),
    });

    await drive("PROJ-1239", { tracker: trackerOf(held), agent, briefs });
    fs.rmSync(root, { recursive: true, force: true });

    expect(seen[0]).toContain(OWN);
    expect(seen[0]).not.toMatch(/brief for the feature this ticket belongs to/);
  });
});
