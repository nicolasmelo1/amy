import { describe, it, expect } from "vitest";
import { AgentOutcome, AgentRun, AskContext, Harness } from "@amykit/core";
import { RecordingEventLog } from "@amykit/test-fixtures";
import { HarnessRelay } from "../src/HarnessRelay.js";
import { oneLadder } from "../src/ladders.js";
import { NamedHarness } from "../src/collection.js";

const NOW = new Date("2026-09-04T20:00:00.000Z");

function run(outcome: AgentOutcome, harness: string, model: string): AgentRun {
  return { outcome, harness, model, durationMs: 10, costSource: "unknown", output: "" };
}

/** A rung that answers however the test says, and remembers what it was asked. */
function rung(
  harness: string,
  model: string,
  outcomes: AgentOutcome[],
  lendsSkill = true,
): NamedHarness & { asked: string[] } {
  const asked: string[] = [];
  let turn = 0;

  const cli: Harness = {
    name: harness,
    ...(lendsSkill ? { lendsSkill: true } : {}),
    ask: async (prompt) => {
      asked.push(prompt);
      const outcome = outcomes[Math.min(turn, outcomes.length - 1)] ?? "completed";
      turn += 1;
      return { text: `${harness}:${model} answered`, run: run(outcome, harness, model) };
    },
  };

  return { name: `${harness}:${model}`, harness, model, cli, asked };
}

/** Where the skills these tests name are installed. */
const located = (skill: string) => `/skills/${skill}`;

describe("a ladder per step", () => {
  it("sends a step to the ladder named for it", async () => {
    const cheap = rung("claude", "haiku", ["completed"]);
    const dear = rung("claude", "opus", ["completed"]);

    await new HarnessRelay({ fallback: [dear], byStep: { "draft-plan": [cheap] } }).ask(
      "write a plan",
      "/checkouts/widgets",
      { step: "draft-plan" },
    );

    expect(cheap.asked).toHaveLength(1);
    expect(dear.asked).toHaveLength(0);
  });

  it("sends every other step to the fallback", async () => {
    const cheap = rung("claude", "haiku", ["completed"]);
    const dear = rung("claude", "opus", ["completed"]);

    await new HarnessRelay({ fallback: [dear], byStep: { "draft-plan": [cheap] } }).ask(
      "do the errand",
      "/checkouts/widgets",
      { step: "run-errand" },
    );

    expect(dear.asked).toHaveLength(1);
    expect(cheap.asked).toHaveLength(0);
  });

  it("climbs the step's own ladder when its first rung fails", async () => {
    // The two ladders are not alternatives: a step picks one, and then the
    // failure ladder is climbed inside it. Falling back to the default on a
    // failure would mean an operator who asked for a cheap model got the
    // expensive one every time the cheap one wobbled.
    const cheap = rung("claude", "haiku", ["failed"]);
    const middling = rung("claude", "sonnet", ["completed"]);
    const dear = rung("claude", "opus", ["completed"]);

    await new HarnessRelay({
      fallback: [dear],
      byStep: { triage: [cheap, middling] },
    }).ask("read the ticket", "/x", { step: "triage" });

    expect(cheap.asked).toHaveLength(1);
    expect(middling.asked).toHaveLength(1);
    expect(dear.asked).toHaveLength(0);
  });

  it("still relays when only a step has any rungs at all", async () => {
    const cheap = rung("claude", "haiku", ["completed"]);

    const reply = await new HarnessRelay({
      fallback: [],
      byStep: { triage: [cheap] },
    }).ask("read the ticket", "/x", { step: "triage" });

    expect(reply.run.outcome).toBe("completed");
  });
});

describe("one harness made of several", () => {
  it("refuses to exist with nothing to relay to", () => {
    expect(() => new HarnessRelay(oneLadder([]))).toThrow("no harness plugin contributed one");
  });

  it("asks the first rung and stops when it answers", async () => {
    const first = rung("claude", "sonnet", ["completed"]);
    const second = rung("codex", "gpt-5", ["completed"]);

    const reply = await new HarnessRelay(oneLadder([first, second])).ask("write a plan", "/checkouts/widgets");

    expect(reply.text).toBe("claude:sonnet answered");
    expect(second.asked).toEqual([]);
  });

  it("escalates the model after a failure, on the same harness", async () => {
    const cheap = rung("claude", "sonnet", ["failed"]);
    const dear = rung("claude", "opus", ["completed"]);

    await new HarnessRelay(oneLadder([cheap, dear])).ask("write a plan", "/checkouts/widgets");

    expect(dear.asked).toHaveLength(1);
  });

  it("skips the rest of a harness that is out of quota", async () => {
    // A stronger model on the same harness is behind the same quota, so
    // trying it is a call nobody needed to make.
    const cheap = rung("claude", "sonnet", ["rate-limited"]);
    const dear = rung("claude", "opus", ["completed"]);
    const other = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([cheap, dear, other])).ask("write a plan", "/checkouts/widgets");

    expect(dear.asked).toEqual([]);
    expect(other.asked).toHaveLength(1);
  });

  it("starts nothing else after a run that was abandoned", async () => {
    // A killed child is one cause, and the handbrake has to mean the next
    // thing does not start.
    const first = rung("claude", "sonnet", ["abandoned"]);
    const second = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([first, second])).ask("write a plan", "/checkouts/widgets");

    expect(second.asked).toEqual([]);
  });

  it("tells the next rung it is picking up half-done work", async () => {
    const first = rung("claude", "sonnet", ["rate-limited"]);
    const second = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([first, second])).ask("write a plan", "/checkouts/widgets");

    expect(second.asked[0]).toContain("ran out of quota partway through");
    expect(second.asked[0]).toContain("Continue it; do not begin again.");
  });

  it("keeps the caller's own words whole beside the handoff", async () => {
    // A retry already carries what went wrong; the handoff is added to it,
    // never instead of it.
    const first = rung("claude", "sonnet", ["rate-limited"]);
    const second = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([first, second])).ask("A previous attempt did not hold: lint", "/x");

    expect(first.asked[0]).toBe("A previous attempt did not hold: lint");
    expect(second.asked[0]).toContain("A previous attempt did not hold: lint");
    expect(second.asked[0]).toContain("ran out of quota partway through");
  });

  it("hands back the last answer, rather than a summary of several", async () => {
    const first = rung("claude", "sonnet", ["failed"]);
    const second = rung("codex", "gpt-5", ["failed"]);

    const reply = await new HarnessRelay(oneLadder([first, second])).ask("write a plan", "/x");

    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.harness).toBe("codex");
  });

  it("writes down which axis moved, and what the work was", async () => {
    const log = new RecordingEventLog();
    const first = rung("claude", "sonnet", ["failed"]);
    const second = rung("claude", "opus", ["completed"]);

    await new HarnessRelay(oneLadder([first, second]), { log, now: () => NOW }).ask("p", "/x", {
      workId: "note-1",
      step: "draft-plan",
    });

    expect(log.events).toMatchObject([
      {
        kind: "agent.handoff",
        workId: "note-1",
        detail: { action: "draft-plan", moved: "model", cause: "failed" },
      },
    ]);
  });
});

describe("a reply the step's own verify refuses", () => {
  it("asks the next rung, and tells it why the answer was refused", async () => {
    const first = rung("claude", "sonnet", ["completed"]);
    const second = rung("claude", "opus", ["completed"]);
    const why = "the answer held no JSON object";

    const reply = await new HarnessRelay(oneLadder([first, second])).ask("read the ticket", "/x", {
      step: "triage",
      // HarnessRelay.ts:113 climbs on what verify answers, not on the CLI's verdict.
      verify: async (answer) => ({ ...answer, run: { ...answer.run, outcome: "failed" as const, refused: why } }),
    });

    expect(first.asked).toHaveLength(1);
    expect(second.asked).toHaveLength(1);
    // handoff.ts:21 carries the reason rather than "did not succeed".
    expect(second.asked[0]).toContain(`answered, and that answer was refused: ${why}`);
    expect(second.asked[0]).not.toContain("did not succeed");
    expect(reply.run.refused).toBe(why);
    expect(reply.run.outcome).toBe("failed");
  });
});

describe("an ask told which rung to begin on", () => {
  it("starts at the rung it names and never asks the ones below it", async () => {
    const first = rung("claude", "haiku", ["completed"]);
    const second = rung("claude", "sonnet", ["completed"]);

    await new HarnessRelay(oneLadder([first, second])).ask("write a plan", "/x", { step: "draft-plan", rung: 1 });

    // HarnessRelay.ts:94 begins at the rung the context names.
    expect(first.asked).toEqual([]);
    expect(second.asked).toHaveLength(1);
  });

  it("still skips the rest of that harness when the rung it began on was rate-limited", async () => {
    const below = rung("claude", "haiku", ["completed"]);
    const at = rung("claude", "sonnet", ["rate-limited"]);
    const above = rung("claude", "opus", ["completed"]);
    const other = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([below, at, above, other])).ask("write a plan", "/x", { rung: 1 });

    expect(below.asked).toEqual([]);
    expect(at.asked).toHaveLength(1);
    expect(above.asked).toEqual([]);
    expect(other.asked).toHaveLength(1);
  });

  it("climbs in order from that rung when its run failed", async () => {
    const below = rung("claude", "haiku", ["completed"]);
    const at = rung("claude", "sonnet", ["failed"]);
    const above = rung("claude", "opus", ["completed"]);
    const other = rung("codex", "gpt-5", ["completed"]);

    await new HarnessRelay(oneLadder([below, at, above, other])).ask("write a plan", "/x", { rung: 1 });

    expect(below.asked).toEqual([]);
    expect(at.asked).toHaveLength(1);
    expect(above.asked).toHaveLength(1);
    expect(other.asked).toEqual([]);
  });
});

describe("handing the step to a skill", () => {
  it("hands the harness the skill it addressed the prompt to, with the directory it is installed in", async () => {
    const contexts: AskContext[] = [];
    const cli: Harness = {
      name: "claude",
      lendsSkill: true,
      ask: async (_prompt, _cwd, context = {}) => {
        contexts.push(context);
        return { text: "done", run: run(contexts.length === 1 ? "failed" : "completed", "claude", "sonnet") };
      },
    };
    const only: NamedHarness = { name: "claude:sonnet", harness: "claude", model: "sonnet", cli };

    const reply = await new HarnessRelay(oneLadder([only]), {
      skills: { "draft-plan": ["factory-author", "logion"] },
      locate: (skill) => (skill === "factory-author" ? "/skills/factory-author" : undefined),
    }).ask("write a plan", "/x", { step: "draft-plan", workId: "note-1" });

    // The first skill is handed over. The second has no directory, so it is
    // refused rather than sent `/logion` with nothing behind it.
    expect(contexts.map((context) => context.skill)).toEqual([{ name: "factory-author", path: "/skills/factory-author" }]);
    expect(contexts.every((context) => context.workId === "note-1")).toBe(true);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("was not found");
  });

  it("addresses the prompt to the skill named for the step", async () => {
    const only = rung("claude", "sonnet", ["completed"]);

    await new HarnessRelay(oneLadder([only]), { skills: { "draft-plan": ["factory-author"] }, locate: located }).ask(
      "write a plan",
      "/x",
      { step: "draft-plan" },
    );

    expect(only.asked[0]).toBe("/factory-author\n\nwrite a plan");
  });

  it("asks in the caller's own words when no skill was named for the step", async () => {
    const only = rung("claude", "sonnet", ["completed"]);

    await new HarnessRelay(oneLadder([only]), { skills: { triage: ["logion"] } }).ask("write a plan", "/x", {
      step: "draft-plan",
    });

    expect(only.asked[0]).toBe("write a plan");
  });

  it("asks no other skill once one has answered", async () => {
    const only = rung("claude", "sonnet", ["completed"]);

    await new HarnessRelay(oneLadder([only]), { skills: { "draft-plan": ["first", "second"] }, locate: located }).ask(
      "write a plan",
      "/x",
      { step: "draft-plan" },
    );

    expect(only.asked).toEqual(["/first\n\nwrite a plan"]);
  });

  it("moves to the next skill when the first did not answer", async () => {
    const only = rung("claude", "sonnet", ["failed", "completed"]);

    await new HarnessRelay(oneLadder([only]), { skills: { "draft-plan": ["first", "second"] }, locate: located }).ask(
      "write a plan",
      "/x",
      { step: "draft-plan" },
    );

    expect(only.asked[1]).toBe("/second\n\nwrite a plan");
  });

  it("exhausts the harnesses for one skill before trying the next", async () => {
    // Two ladders, two questions: which skill should do the step, and what to
    // do when the one asked could not.
    const claude = rung("claude", "sonnet", ["failed", "failed"]);
    const codex = rung("codex", "gpt-5", ["failed", "completed"]);

    await new HarnessRelay(oneLadder([claude, codex]), { skills: { implement: ["first", "second"] }, locate: located }).ask(
      "do it",
      "/x",
      { step: "implement" },
    );

    expect(claude.asked.map((p) => p.split("\n")[0])).toEqual(["/first", "/second"]);
    expect(codex.asked.map((p) => p.split("\n")[0])).toEqual(["/first", "/second"]);
  });

  it("stops asking skills once a run was abandoned", async () => {
    const only = rung("claude", "sonnet", ["abandoned"]);

    await new HarnessRelay(oneLadder([only]), { skills: { "draft-plan": ["first", "second"] }, locate: located }).ask(
      "write a plan",
      "/x",
      { step: "draft-plan" },
    );

    expect(only.asked).toHaveLength(1);
  });

  it("says which skill gave up and which is being asked next", async () => {
    const log = new RecordingEventLog();
    const only = rung("claude", "sonnet", ["failed", "completed"]);

    await new HarnessRelay(oneLadder([only]), {
      log,
      now: () => NOW,
      skills: { "draft-plan": ["first", "second"] },
      locate: located,
    }).ask("write a plan", "/x", { workId: "note-1", step: "draft-plan" });

    expect(log.events.filter((e) => e.detail?.moved === "skill")).toMatchObject([
      { detail: { from: { skill: "first" }, to: { skill: "second" }, moved: "skill" } },
    ]);
  });

  it("never addresses a rung that cannot be handed the skill", async () => {
    const only = rung("codex", "gpt-5", ["completed"], false);

    const reply = await new HarnessRelay(oneLadder([only]), {
      skills: { "draft-plan": ["amy-groom"] },
      locate: located,
    }).ask("write a plan", "/x", { step: "draft-plan" });

    expect(only.asked).toEqual([]);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("does not lend a skill");
  });

  it("refuses when the skill's directory is not found, rather than sending /name bare", async () => {
    const only = rung("claude", "sonnet", ["completed"]);

    const reply = await new HarnessRelay(oneLadder([only]), {
      skills: { "draft-plan": ["amy-groom"] },
    }).ask("write a plan", "/x", { step: "draft-plan" });

    expect(only.asked).toEqual([]);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("was not found");
  });
});

describe("a refused reply when the step names skills", () => {
  it("tells the next skill's first rung why the last answer was refused", async () => {
    const claude = rung("claude", "sonnet", ["completed"]);
    const why = "the review ended on no verdict";
    let seen = 0;

    await new HarnessRelay(oneLadder([claude]), {
      skills: { review: ["first", "second"] },
      locate: located,
    }).ask("review it", "/x", {
      step: "review",
      // Refuses the first skill's answer only.
      verify: async (answer) =>
        (seen += 1) === 1 ? { ...answer, run: { ...answer.run, outcome: "failed" as const, refused: why } } : answer,
    });

    expect(claude.asked.map((p) => p.split("\n")[0])).toEqual(["/first", "/second"]);
    // The next one asked is told the reason, never nothing.
    expect(claude.asked[1]).toContain(`answered, and that answer was refused: ${why}`);
  });
});
