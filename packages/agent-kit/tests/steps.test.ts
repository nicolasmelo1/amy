import { describe, expect, it, vi } from "vitest";
import { Agent, AgentRun, HarnessReply } from "@amykit/core";
import { implementStep, judgeStep } from "../src/steps.js";
import { HarnessRelay } from "../src/HarnessRelay.js";
import { oneLadder } from "../src/ladders.js";
import { NamedHarness } from "../src/collection.js";

/** A rung of a real relay that completes every time, remembering it was asked. */
function rung(model: string, outcome: AgentRun["outcome"] = "completed"): NamedHarness & { asked: number } {
  const named = {
    name: `claude:${model}`,
    harness: "claude",
    model,
    asked: 0,
    cli: {
      name: "claude",
      ask: async (): Promise<HarnessReply> => {
        named.asked += 1;
        return { text: "", run: { ...run(outcome), model } };
      },
    },
  };
  return named;
}

function run(outcome: AgentRun["outcome"] = "completed", output = ""): AgentRun {
  return { outcome, harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output };
}

function answering(reply: HarnessReply): Agent & { ask: ReturnType<typeof vi.fn> } {
  return { ask: vi.fn<Agent["ask"]>().mockResolvedValue(reply) };
}

const NOW = (): Date => new Date("2026-10-03T12:00:00.000Z");

describe("implementStep", () => {
  it("asks once, then commits only through the commit its caller passed", async () => {
    const agent = answering({ text: "", run: run() });
    const commit = vi.fn().mockResolvedValue(true);

    const result = await implementStep(agent, { prompt: "do it", cwd: "/w", context: { step: "implement" }, commit, now: NOW });

    expect(agent.ask).toHaveBeenCalledWith("do it", "/w", expect.objectContaining({ step: "implement" }));
    expect(commit).toHaveBeenCalledOnce();
    expect(result.value).toEqual({ ok: true, output: "", at: "2026-10-03T12:00:00.000Z", progress: { kind: "advanced", key: "implementation" } });
  });

  it("reports a run that changed nothing as unchanged, and as a failed run", async () => {
    const result = await implementStep(answering({ text: "", run: run("completed", "looked around") }), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect(result.value.ok).toBe(false);
    expect(result.value.progress).toEqual({ kind: "unchanged", key: "implementation", detail: "the agent finished without changing any file" });
    expect(result.value.output).toContain("looked around");
    expect(result.run.outcome).toBe("failed");
  });

  it("never commits a run that did not complete, and hands its account back", async () => {
    const commit = vi.fn();

    const result = await implementStep(answering({ text: "", run: run("rate-limited", "429") }), { prompt: "p", cwd: "/w", commit, now: NOW });

    expect(commit).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { ok: false, output: "429", at: "2026-10-03T12:00:00.000Z" }, run: run("rate-limited", "429") });
  });
});

describe("implementStep over a relay", () => {
  it("climbs to the stronger model when the first rung completed and changed nothing", async () => {
    const weak = rung("sonnet");
    const strong = rung("opus");
    const commits = [false, true];

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      context: { step: "implement" },
      commit: async () => commits.shift()!,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 1]);
    expect(result.value.ok).toBe(true);
    expect(result.run.model).toBe("opus");
  });

  it("says unchanged when every rung completed and none changed a file", async () => {
    const result = await implementStep(new HarnessRelay(oneLadder([rung("sonnet"), rung("opus")])), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect(result.value.progress).toMatchObject({ kind: "unchanged" });
    expect(result.run.outcome).toBe("failed");
  });

  it("never lets an earlier rung's verdict speak for a later rung that failed otherwise", async () => {
    const result = await implementStep(new HarnessRelay(oneLadder([rung("sonnet"), rung("opus", "failed")])), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect(result.value.ok).toBe(false);
    expect(result.value.progress).toBeUndefined();
  });
});

describe("judgeStep", () => {
  it("reads the JSON answer the caller describes", async () => {
    const result = await judgeStep(answering({ text: 'Sure.\n{"clear": true}', run: run() }), {
      prompt: "p",
      cwd: "/w",
      read: (answer) => (answer as { clear: boolean }).clear,
      fallback: false,
    });

    expect(result.value).toBe(true);
  });

  it("yields the fallback with the run's account when the run did not complete", async () => {
    const read = vi.fn();

    const result = await judgeStep(answering({ text: "", run: run("failed", "boom") }), { prompt: "p", cwd: "/w", read, fallback: "nothing" });

    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({ value: "nothing", run: run("failed", "boom") });
  });
});
