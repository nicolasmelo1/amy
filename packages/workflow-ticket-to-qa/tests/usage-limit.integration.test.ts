import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HarnessReply } from "@amykit/core";
import { FileQueue } from "@amykit/plugin-file-queue";
import { Worker } from "@amykit/plugin-serial-engine";
import { InMemoryStore, fakeAgent, fakeGit, policy, record, ticketWorkerDeps } from "@amykit/test-fixtures";

/** A real Worker/testkit walk: limits wait on one branch, then failures exhaust it. */
describe("usage limits through the ticket worker", () => {
  it("keeps one tree, refunds two limits, then escalates after two failures", async () => {
    let clock = new Date("2026-09-03T10:00:00.000Z");
    const replies: HarnessReply[] = [
      { text: "half a change", run: { outcome: "rate-limited", harness: "codex", model: "gpt-5", durationMs: 1, costSource: "unknown", output: "half a change", retryAfterMs: 60_000 } },
      { text: "", run: { outcome: "rate-limited", harness: "codex", model: "gpt-5", durationMs: 1, costSource: "unknown", output: "limited" } },
      { text: "broken", run: { outcome: "failed", harness: "codex", model: "gpt-5", durationMs: 1, costSource: "unknown", output: "broken" } },
      { text: "still broken", run: { outcome: "failed", harness: "codex", model: "gpt-5", durationMs: 1, costSource: "unknown", output: "still broken" } },
    ];
    const agent = fakeAgent({ ask: vi.fn().mockImplementation(async () => replies.shift()!) });
    const git = { ...fakeGit(), headSha: vi.fn().mockResolvedValue("0".repeat(40)) };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-limit-walk-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    records.save(record("IMPLEMENTING"));
    const worker = new Worker({ queue, records, ...(await ticketWorkerDeps({ agent, git, policy: { ...policy, maxImplementAttempts: 2, pollBackoffMs: 90_000 }, now: () => clock })) });

    const look = async (enqueue = false) => {
      if (enqueue)
        queue.enqueue({ workId: "PROJ-1239", reason: "prove usage limit" }, clock);
      await worker.tick();
      clock = new Date(clock.getTime() + 60_000);
    };
    try {
      await look(true);
      expect(records.load("PROJ-1239")?.state).toBe("IMPLEMENTING");
      expect(records.load("PROJ-1239")?.attempts.IMPLEMENTING ?? 0).toBe(0);
      expect(git.commitAndPush).not.toHaveBeenCalled();
      expect(git.headSha).not.toHaveBeenCalled();
      expect(records.load("PROJ-1239")?.lastImplementation).toBeUndefined();
      expect(records.load("PROJ-1239")?.implemented).toBeUndefined();
      expect(records.load("PROJ-1239")?.continuationContext).toContain("half a change");

      clock = new Date(clock.getTime() - 1);
      await worker.tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(1);
      clock = new Date(clock.getTime() + 1);

      await look();
      expect(records.load("PROJ-1239")?.state).toBe("IMPLEMENTING");
      expect(records.load("PROJ-1239")?.attempts.IMPLEMENTING ?? 0).toBe(0);
      expect(git.commitAndPush).not.toHaveBeenCalled();
      expect(git.headSha).not.toHaveBeenCalled();
      expect(vi.mocked(agent.ask).mock.calls[1]?.[0]).toContain(
        "Continue the half-finished implementation already in this working tree",
      );
      expect(vi.mocked(agent.ask).mock.calls[1]?.[0]).toContain("half a change");
      expect(records.load("PROJ-1239")?.continuationContext).toContain(
        "half a change",
      );

      clock = new Date(clock.getTime() + 30_000 - 1);
      await worker.tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(2);
      clock = new Date(clock.getTime() + 1);

      await look();
      expect(records.load("PROJ-1239")).toMatchObject({ state: "IMPLEMENTING", attempts: { IMPLEMENTING: 1 } });
      await look();
      await look(); // the next decision sees both genuine failures and escalates.
      const settled = records.load("PROJ-1239")!;
      expect(settled).toMatchObject({ state: "ESCALATED", attempts: { IMPLEMENTING: 2 } });
      expect(settled.lastImplementation?.output).toBe("still broken");
      expect(settled.continuationContext).toBeUndefined();
      expect(settled.history.map((move) => `${move.from}>${move.to}`)).toContain("IMPLEMENTING>ESCALATED");
      // Only actual failed attempts read the branch; the two limited asks left
      // no retry result, revision, commit, or no-retry evidence behind.
      expect(git.headSha).toHaveBeenCalledTimes(2);
      expect(git.commitAndPush).not.toHaveBeenCalled();
      expect(settled.implemented).toBeDefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
