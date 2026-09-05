import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import { describePoke, poke } from "../src/poke.js";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const MINUTE = 60 * 1000;

/**
 * The real queue rather than a fake one.
 *
 * What a poke has to get right is the interaction between three states of the
 * same directory — held back, due, claimed — and a fake would be a second
 * opinion about which is which.
 */
function queueIn(): FileQueue {
  return new FileQueue(fs.mkdtempSync(path.join(os.tmpdir(), "amy-poke-")));
}

describe("poke", () => {
  it("brings a held-back look forward", () => {
    const queue = queueIn();
    queue.enqueue({ workId: "PROJ-1", reason: "waiting on review", delayMs: 5 * MINUTE }, NOW);

    expect(poke(queue, "PROJ-1", NOW)).toEqual({ kind: "brought-forward", moved: 1 });
    expect(queue.claim(NOW)?.workId).toBe("PROJ-1");
  });

  it("queues work nothing knew about, which is the webhook case", () => {
    const queue = queueIn();

    expect(poke(queue, "PROJ-1", NOW)).toEqual({ kind: "queued" });
    expect(queue.claim(NOW)?.workId).toBe("PROJ-1");
  });

  it("leaves a claimed piece of work alone, so the chain cannot fork", () => {
    const queue = queueIn();
    queue.enqueue({ workId: "PROJ-1", reason: "discovered" }, NOW);
    queue.claim(NOW);

    expect(poke(queue, "PROJ-1", NOW)).toEqual({ kind: "running" });
    expect(queue.pending()).toHaveLength(0);
  });

  it("adds nothing to a look that is already due", () => {
    const queue = queueIn();
    queue.enqueue({ workId: "PROJ-1", reason: "discovered" }, NOW);

    expect(poke(queue, "PROJ-1", NOW)).toEqual({ kind: "already-due" });
    expect(queue.pending()).toHaveLength(1);
  });

  it("never leaves two looks at one piece of work, whatever it was poked from", () => {
    for (const setUp of [
      (q: FileQueue): void => {
        q.enqueue({ workId: "PROJ-1", reason: "held", delayMs: 5 * MINUTE }, NOW);
      },
      (q: FileQueue): void => {
        q.enqueue({ workId: "PROJ-1", reason: "due" }, NOW);
      },
      (): void => {},
    ]) {
      const queue = queueIn();
      setUp(queue);

      poke(queue, "PROJ-1", NOW);
      poke(queue, "PROJ-1", NOW);

      expect(queue.pending().filter((item) => item.workId === "PROJ-1")).toHaveLength(1);
    }
  });

  it("says something different for every outcome", () => {
    const said = [
      describePoke("PROJ-1", { kind: "running" }),
      describePoke("PROJ-1", { kind: "brought-forward", moved: 1 }),
      describePoke("PROJ-1", { kind: "already-due" }),
      describePoke("PROJ-1", { kind: "queued" }),
    ];

    expect(new Set(said).size).toBe(said.length);
    for (const line of said) expect(line).toContain("PROJ-1");
  });
});
