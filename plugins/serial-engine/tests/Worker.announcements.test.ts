import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import {
  InMemoryStore,
  RecordingNotifier,
  WORKDAY,
  fakeTracker,
  ticketWorkerDeps,
  TicketWorkerOverrides,
} from "@amykit/test-fixtures";
import { Worker } from "../src/Worker.js";

/**
 * Which of the three the engine says it is saying.
 *
 * The kind is not decoration. A channel that turns trouble into a friction
 * note has to tell "I am retrying" from "I have stopped", or every step that
 * failed once and worked on the second attempt buries the ones that genuinely
 * broke. The engine is the only thing that knows which it is.
 */
describe("what kind of announcement the engine makes", () => {
  let root: string;
  let queue: FileQueue;
  let notifier: RecordingNotifier;
  let clock: Date;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-kinds-"));
    queue = new FileQueue(path.join(root, "queue"));
    notifier = new RecordingNotifier();
    clock = new Date(WORKDAY);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function build(overrides: TicketWorkerOverrides = {}, maxItemAttempts = 5): Worker {
    return new Worker({
      queue,
      records: new InMemoryStore(),
      ...ticketWorkerDeps({
        notifier,
        now: () => clock,
        config: { maxItemAttempts },
        ...overrides,
      }),
    });
  }

  /** A tracker that is down, which is what an outage looks like from here. */
  const down = () =>
    fakeTracker({ get: vi.fn().mockRejectedValue(new Error("could not connect")) });

  const kinds = (): (string | undefined)[] =>
    notifier.announcements.map((announcement) => announcement.kind);

  it("says it is still retrying on the way down", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ tracker: down() }).tick();

    expect(kinds()).toEqual(["failing"]);
  });

  it("says it has stopped once it reaches the ceiling", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build({ tracker: down() }, 1).tick();

    expect(kinds()).toEqual(["gave-up"]);
  });

  it("says the work is moving again when it recovers", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "retrying", attempt: 2 }, clock);

    await build().tick();

    expect(kinds()).toEqual(["recovered"]);
  });

  it("says nothing at all about a move that went fine", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await build().tick();

    expect(notifier.announcements).toEqual([]);
  });
});
