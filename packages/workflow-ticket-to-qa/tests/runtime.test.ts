import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import {
  InMemoryStore,
  WORKDAY,
  ticket,
  ticketWorkerDeps,
} from "@amykit/test-fixtures";
import { Worker } from "@amykit/plugin-serial-engine";
import type { Tracker } from "../src/ports/Tracker.js";
import type { Ticket } from "../src/ticket.js";

/**
 * A tracker that names no body is a real tracker, not a broken one.
 *
 * `body` is optional on purpose: a tracker cannot be asked to carry a
 * description it has no field for, and an install running one has to mount
 * and drive work exactly as before — with the prompt saying what is missing
 * rather than the machine refusing a ticket over it.
 */
describe("a runtime whose tracker supplies no body", () => {
  const clock = new Date(WORKDAY);

  function trackerWithoutBody(): { tracker: Tracker; inProgress: ReturnType<typeof vi.fn> } {
    const { body: _omitted, ...bare } = ticket() as Ticket & { body?: string };
    const inProgress = vi.fn<() => Promise<Ticket[]>>().mockResolvedValue([bare as Ticket]);
    const get = vi.fn<() => Promise<Ticket | null>>().mockResolvedValue(bare as Ticket);

    return {
      tracker: {
        inProgress,
        get,
        comment: async () => {},
        comments: async () => [],
        hasReplyAfter: async () => false,
        setStatus: async () => {},
        assign: async () => {},
        createFollowUp: async () => "PROJ-9999",
      },
      inProgress,
    };
  }

  async function tickWith(tracker: Tracker, times = 2) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-nobody-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    const worker = new Worker({
      queue,
      records,
      ...ticketWorkerDeps({ tracker, now: () => clock }),
    });
    for (let look = 0; look < times; look += 1) await worker.tick();

    return records.records.get("PROJ-1239");
  }

  it("still drives work: the triage runs and its answer folds into the record", async () => {
    const { tracker } = trackerWithoutBody();

    const record = await tickWith(tracker);

    expect(record?.triage).toMatchObject({ clear: true, questions: [] });
  });

  it("moves the body-less ticket through the machine's first transition", async () => {
    const { tracker } = trackerWithoutBody();

    const record = await tickWith(tracker);

    // DISCOVERED triaged clear, so the same look advanced to READY: the
    // machine did its work on a ticket that arrived with nothing to say.
    expect(record?.id).toBe("PROJ-1239");
    expect(record?.state).toBe("READY");
  });
});