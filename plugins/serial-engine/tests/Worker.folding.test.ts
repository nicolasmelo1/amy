import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "@amy/plugin-file-queue";
import { InMemoryStore, WORKDAY, fakeGate, ticketWorkerDeps } from "@amy/test-fixtures";
import { Worker } from "../src/Worker.js";

/**
 * The plan is folded into the record once, by the engine, and the runtime
 * folds only what the engine cannot.
 *
 * It used to be folded twice — once here and once inside the runtime's own
 * `apply` — which counted every retry as two and wrote a transition from each
 * state to itself. Nothing noticed for a long time, because the end-to-end
 * runs read the states they observed rather than the history the record kept,
 * and because a doubled attempt count only shows up as a ceiling arriving
 * sooner than the config says.
 */
describe("folding a plan into the record", () => {
  let root: string;
  let queue: FileQueue;
  let records: InMemoryStore;
  const clock = new Date(WORKDAY);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-fold-"));
    queue = new FileQueue(path.join(root, "queue"));
    records = new InMemoryStore();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function worker(): Worker {
    return new Worker({
      queue,
      records,
      ...ticketWorkerDeps({ now: () => clock }),
    });
  }

  it("counts one attempt per look, not two", async () => {
    // DISCOVERED acts: it asks the agent to triage. One look, one attempt.
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    await worker().tick();

    expect(records.records.get("PROJ-1239")?.attempts).toEqual({ DISCOVERED: 1 });
  });

  it("writes one transition per move, and none from a state to itself", async () => {
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);
    await worker().tick();
    await worker().tick();

    const history = records.records.get("PROJ-1239")?.history ?? [];

    expect(history.map((move) => `${move.from}>${move.to}`)).toEqual(["DISCOVERED>READY"]);
  });

  it("still keeps what only the workflow could fold", async () => {
    // The gate result is the runtime's half. Losing it would be the other
    // way to get this wrong.
    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, clock);

    const gate = fakeGate(false, "the gate is red");
    for (let look = 0; look < 8; look += 1) {
      await new Worker({ queue, records, ...ticketWorkerDeps({ now: () => clock, gate }) }).tick();
    }

    expect(records.records.get("PROJ-1239")?.lastGate?.output).toBe("the gate is red");
  });
});
