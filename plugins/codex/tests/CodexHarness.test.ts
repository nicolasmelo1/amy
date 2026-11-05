import { describe, expect, it } from "vitest";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { CodexAppServer, CodexHarness, CodexTurn, classify, isLimited, resetAt } from "../src/index.js";

const completed: CodexTurn = { status: "completed", items: [{ type: "agentMessage", text: "done" }] };

function harnessFor(result: Awaited<ReturnType<CodexAppServer["run"]>>) {
  const calls: object[] = [];
  const app: CodexAppServer = { run: async (input) => { calls.push(input); return result; } };
  return { calls, harness: new CodexHarness(new ScriptedRunner(), { model: "gpt-5" }, app) };
}

describe("the app-server harness", () => {
  it("has parity with the former completed run", async () => {
    const { harness } = harnessFor({ turn: completed });
    const reply = await harness.ask("fix it", "/work");
    expect(reply).toMatchObject({ text: "done", run: { outcome: "completed", harness: "codex", model: "gpt-5", costSource: "unknown" } });
  });

  it("has parity with the former failed run", async () => {
    const { harness } = harnessFor({ turn: { status: "failed", items: [], error: { message: "bad request", codexErrorInfo: "badRequest" } } });
    expect((await harness.ask("fix it", "/work")).run.outcome).toBe("failed");
  });

  it.each(["usageLimitExceeded", "rateLimitExceeded"])("recognizes the structured %s signal", async (code) => {
    const { harness } = harnessFor({
      turn: { status: "failed", items: [], error: { message: "limited", codexErrorInfo: code } },
      limits: { rateLimits: { primary: { resetsAt: 1_800_000_000 } } },
    });
    const reply = await harness.ask("fix it", "/work");
    expect(reply.run.outcome).toBe("rate-limited");
    expect(reply.run.retryAfterMs).toEqual(expect.any(Number));
  });

  it("does not infer a limit from a prose error", () => {
    expect(isLimited("you have been rate limited")).toBe(false);
    expect(classify({ status: "failed", items: [], error: { message: "rate limited in prose" } })).toBe("failed");
  });

  it("uses the earliest reported account window reset", () => {
    expect(resetAt({ rateLimits: { primary: { resetsAt: 10 }, secondary: { resetsAt: 5 } } })).toBe(5_000);
  });

  it("passes the prompt, working tree, model and sandbox through the app-server", async () => {
    const { calls, harness } = harnessFor({ turn: completed });
    await harness.ask("read it", "/work", { readOnly: true });
    expect(calls).toEqual([{ prompt: "read it", cwd: "/work", model: "gpt-5", readOnly: true }]);
  });
});
