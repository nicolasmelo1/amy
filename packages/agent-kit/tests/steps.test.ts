import { describe, expect, it, vi } from "vitest";
import { Agent, AgentRun, HarnessReply } from "@amykit/core";
import { implementStep, judgeStep } from "../src/steps.js";
import { HarnessRelay } from "../src/HarnessRelay.js";
import { oneLadder } from "../src/ladders.js";
import { NamedHarness } from "../src/collection.js";

/** A rung of a real relay that answers with `text`, remembering it was asked. */
function rung(model: string, outcome: AgentRun["outcome"] = "completed", text = ""): NamedHarness & { asked: number } {
  const named = {
    name: `claude:${model}`,
    harness: "claude",
    model,
    asked: 0,
    cli: {
      name: "claude",
      ask: async (): Promise<HarnessReply> => {
        named.asked += 1;
        return { text, run: { ...run(outcome, text), model } };
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

  it("completes a run that changed nothing, with the agent's answer as its reason", async () => {
    const answer = "The docs already say this; there is nothing to change.";
    const result = await implementStep(answering({ text: answer, run: run("completed", answer) }), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect(result.run.outcome).toBe("completed");
    expect(result.run.refused).toBeUndefined();
    expect(result.value.ok).toBe(true);
    expect(result.value.progress).toEqual({ kind: "unchanged", key: "implementation", detail: answer });
  });

  it("never commits a run that did not complete, and hands its account back", async () => {
    const commit = vi.fn();

    const result = await implementStep(answering({ text: "", run: run("rate-limited", "429") }), { prompt: "p", cwd: "/w", commit, now: NOW });

    expect(commit).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { ok: false, output: "429", at: "2026-10-03T12:00:00.000Z" }, run: run("rate-limited", "429") });
  });
});

describe("implementStep over a relay, with no verify declared", () => {
  it("does not climb past a rung that completed and changed nothing", async () => {
    const weak = rung("sonnet", "completed", "Looked through it; nothing in the code needs to move.");
    const strong = rung("opus");

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      context: { step: "implement" },
      commit: async () => false,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 0]);
    expect(result.run.model).toBe("sonnet");
    expect(result.run.outcome).toBe("completed");
    expect(result.value.progress).toEqual({
      kind: "unchanged",
      key: "implementation",
      detail: "Looked through it; nothing in the code needs to move.",
    });
  });

  it("does not climb on silence either: a run that changed nothing and said nothing still completes", async () => {
    const weak = rung("sonnet", "completed", "");
    const strong = rung("opus");

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 0]);
    expect(result.run.outcome).toBe("completed");
    expect(result.value.progress).toMatchObject({ kind: "unchanged" });
  });

  it("reads no marker from the answer: the whole answer is the reason", async () => {
    const answer = "NOTHING_TO_CHANGE: the docs already say it\n\nI checked README and the guide.";
    const result = await implementStep(answering({ text: answer, run: run("completed", answer) }), {
      prompt: "p",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect(result.value.progress).toEqual({ kind: "unchanged", key: "implementation", detail: answer });
  });

  it("still climbs a rung that crashed, and the rung that answers is the one reported", async () => {
    const crashed = rung("sonnet", "failed");
    const answered = rung("opus", "completed", "Nothing to change here.");

    const result = await implementStep(new HarnessRelay(oneLadder([crashed, answered])), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => false,
      now: NOW,
    });

    expect([crashed.asked, answered.asked]).toEqual([1, 1]);
    expect(result.run.model).toBe("opus");
    expect(result.value.progress).toEqual({ kind: "unchanged", key: "implementation", detail: "Nothing to change here." });
  });

  it("advances on a run that changed files", async () => {
    const weak = rung("sonnet", "completed", "done");
    const strong = rung("opus");

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      commit: async () => true,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 0]);
    expect(result.value).toMatchObject({ ok: true, progress: { kind: "advanced", key: "implementation" } });
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

  it("fails the action on an answer with no JSON object, as it always did", async () => {
    const read = vi.fn();

    await expect(
      judgeStep(answering({ text: "It looks fine to me.", run: run() }), { prompt: "p", cwd: "/w", read, fallback: "nothing" }),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("asks no stronger rung for an answer with no JSON object", async () => {
    const weak = rung("sonnet", "completed", "It looks fine to me.");
    const strong = rung("opus", "completed", '{"clear":true}');

    await expect(
      judgeStep(new HarnessRelay(oneLadder([weak, strong])), {
        prompt: "p",
        cwd: "/w",
        read: (answer) => (answer as { clear: boolean }).clear,
        fallback: false,
      }),
    ).rejects.toThrow();
    expect([weak.asked, strong.asked]).toEqual([1, 0]);
  });

  it("lets the step's own reader fail the action with its own words", async () => {
    await expect(
      judgeStep(answering({ text: '{"verdict":"maybe"}', run: run() }), {
        prompt: "p",
        cwd: "/w",
        read: () => {
          throw new Error("verdict must be yes or no");
        },
        fallback: "nothing",
      }),
    ).rejects.toThrow("verdict must be yes or no");
  });
});

describe("a verify the step declares itself", () => {
  /** Refuses any answer that does not name the ticket, the way a step's own check would. */
  const namesTheTicket = async (reply: HarnessReply): Promise<HarnessReply> =>
    reply.text.includes("T-1")
      ? reply
      : { ...reply, run: { ...reply.run, outcome: "failed" as const, refused: "the answer never names the ticket" } };

  it("is the one a judging step climbs on", async () => {
    const weak = rung("sonnet", "completed", '{"verdict":"ok"}');
    const strong = rung("opus", "completed", '{"verdict":"ok","ticket":"T-1"}');

    const result = await judgeStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "judge it",
      cwd: "/w",
      context: { step: "triage", verify: namesTheTicket },
      read: (answer) => answer as { verdict: string; ticket?: string },
      fallback: { verdict: "none" },
    });

    expect([weak.asked, strong.asked]).toEqual([1, 1]);
    expect(result.value).toEqual({ verdict: "ok", ticket: "T-1" });
  });

  it("is the one an implementing step climbs on", async () => {
    const weak = rung("sonnet", "completed", "done");
    const strong = rung("opus", "completed", "done for T-1");

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      context: { verify: namesTheTicket },
      commit: async () => true,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 1]);
    expect(result.value.ok).toBe(true);
  });

  it("can refuse a run that changed nothing, and then the relay climbs", async () => {
    const weak = rung("sonnet", "completed", "nothing to do");
    const strong = rung("opus", "completed", "done for T-1");
    const commits = [false, true];

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      context: { verify: namesTheTicket },
      commit: async () => commits.shift()!,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 1]);
    expect(result.run.model).toBe("opus");
    expect(result.value).toMatchObject({ ok: true, progress: { kind: "advanced" } });
  });
});

describe("an implementing attempt that climbed past a refused rung", () => {
  it("says the attempt advanced when the refused rung committed a change and the rung after it added nothing", async () => {
    const weak = rung("sonnet", "completed", "changed the parser");
    const strong = rung("opus", "completed", "the parser change already holds; nothing more to do");
    // The first rung's work is committed before its verify refuses it; the
    // second finds that work in place and leaves the tree as it is.
    const commits = [true, false];
    const refusesTheFirst = async (reply: HarnessReply): Promise<HarnessReply> =>
      reply.run.model === "sonnet"
        ? { ...reply, run: { ...reply.run, outcome: "failed" as const, refused: "the answer never names the ticket" } }
        : reply;

    const result = await implementStep(new HarnessRelay(oneLadder([weak, strong])), {
      prompt: "do it",
      cwd: "/w",
      context: { verify: refusesTheFirst },
      commit: async () => commits.shift()!,
      now: NOW,
    });

    expect([weak.asked, strong.asked]).toEqual([1, 1]);
    // The head moved during this attempt, so it is not a run that changed nothing.
    expect(result.value).toMatchObject({ ok: true, progress: { kind: "advanced", key: "implementation" } });
  });
});
