import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandResult } from "@amykit/core";
import { ClaudeHarness } from "@amykit/plugin-claude";
import { FileQueue } from "@amykit/plugin-file-queue";
import { Worker } from "@amykit/plugin-serial-engine";
import { InMemoryStore, ScriptedRunner, fakeAgent, fakeGit, policy, record, ticketWorkerDeps } from "@amykit/test-fixtures";

/**
 * Review of PR #225: A8 is proven with hand-written HarnessReply objects
 * (usage-limit.integration.test.ts), so no Claude stream ever reaches the
 * worker. Green today; point A8's proof here. A8 says "a single Claude rung ... waits until the reset": this walk
 * drives the real ClaudeHarness over streams the CLI prints, and the reset is
 * the one the stream reported, not a retryAfterMs typed into the test.
 */
const event = (value: object) => JSON.stringify(value);
const INIT = event({ type: "system", subtype: "init", session_id: "s" });
const refused = (text: string, resetsAt?: number) =>
  [
    INIT,
    event({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour", ...(resetsAt === undefined ? {} : { resetsAt }) } }),
    event({ type: "result", subtype: "success", is_error: false, api_error_status: null, result: text }),
  ].join("\n");
const failed = (text: string) =>
  [INIT, event({ type: "result", subtype: "error_during_execution", is_error: true, api_error_status: null, result: text })].join("\n");

afterEach(() => {
  vi.useRealTimers();
});

describe("usage limits from a Claude stream through the ticket worker", () => {
  it("waits for the reset the stream reported, refunds two limits, then escalates after two failures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let clock = new Date("2026-09-03T10:00:00.000Z");
    const RESET_IN_MS = 25 * 60_000;
    const resetsAt = (clock.getTime() + RESET_IN_MS) / 1000;
    const streams: Partial<CommandResult>[] = [
      { stdout: refused("half a change", resetsAt), exitCode: 0 },
      { stdout: refused("still limited"), exitCode: 0 },
      { stdout: failed("broken"), exitCode: 1 },
      { stdout: failed("still broken"), exitCode: 1 },
    ];
    const runner = new ScriptedRunner([]);
    runner.run = vi.fn(async () => {
      const next = streams.shift()!;
      return { ok: next.exitCode === 0, exitCode: next.exitCode ?? 0, stdout: next.stdout ?? "", stderr: "" };
    });
    const harness = new ClaudeHarness(runner, { model: "sonnet" });
    const agent = fakeAgent({ ask: vi.fn().mockImplementation(async (prompt: string) => harness.ask(prompt, "/w")) });
    const git = { ...fakeGit(), headSha: vi.fn().mockResolvedValue("0".repeat(40)) };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-claude-limit-walk-"));
    const queue = new FileQueue(path.join(root, "queue"));
    const records = new InMemoryStore();
    records.save(record("IMPLEMENTING"));
    const worker = new Worker({
      queue,
      records,
      ...(await ticketWorkerDeps({ agent, git, policy: { ...policy, maxImplementAttempts: 2, pollBackoffMs: 90_000 }, now: () => clock })),
    });
    const at = (when: Date) => {
      clock = when;
      vi.setSystemTime(clock);
    };
    const tick = async () => {
      vi.setSystemTime(clock);
      await worker.tick();
    };

    try {
      at(clock);
      queue.enqueue({ workId: "PROJ-1239", reason: "prove a Claude limit" }, clock);
      await tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(1);
      expect(records.load("PROJ-1239")).toMatchObject({ state: "IMPLEMENTING" });
      expect(records.load("PROJ-1239")?.attempts.IMPLEMENTING ?? 0).toBe(0);
      expect(records.load("PROJ-1239")?.continuationContext).toContain("half a change");

      // A minute before the reset the stream reported: nothing runs.
      at(new Date(Date.parse("2026-09-03T10:00:00.000Z") + RESET_IN_MS - 60_000));
      await tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(1);

      // At the reset: the same step reruns, charged nothing.
      at(new Date(Date.parse("2026-09-03T10:00:00.000Z") + RESET_IN_MS));
      await tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(2);
      expect(records.load("PROJ-1239")?.attempts.IMPLEMENTING ?? 0).toBe(0);

      // A refusal with no reset waits the policy backoff.
      const second = clock.getTime();
      at(new Date(second + 90_000 - 1));
      await tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(2);
      at(new Date(second + 90_000));
      await tick();
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(3);
      expect(records.load("PROJ-1239")).toMatchObject({ state: "IMPLEMENTING", attempts: { IMPLEMENTING: 1 } });

      for (let i = 0; i < 4 && records.load("PROJ-1239")?.state !== "ESCALATED"; i++) {
        at(new Date(clock.getTime() + 60 * 60_000));
        await tick();
      }
      const settled = records.load("PROJ-1239")!;
      // Escalated after the second failure, not the second limit.
      expect(settled).toMatchObject({ state: "ESCALATED", attempts: { IMPLEMENTING: 2 } });
      expect(vi.mocked(agent.ask)).toHaveBeenCalledTimes(4);
      expect(settled.lastImplementation?.output).toBe("still broken");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
