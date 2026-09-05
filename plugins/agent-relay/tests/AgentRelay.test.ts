import { describe, it, expect } from "vitest";
import { AgentOutcome, AgentResult } from "@amykit/core";
import { agentResult, RecordingEventLog, ticket } from "@amykit/test-fixtures";
import { NamedAgent } from "@amykit/agent-kit";
import { Agent, AttemptOutcome, TriageOutcome } from "@amykit/workflow-ticket-to-qa";
import { AgentRelay } from "../src/AgentRelay.js";

/** One instant for every double, so nothing here depends on a clock. */
const AT = "2026-09-05T10:00:00.000Z";

const TICKET = ticket({ id: "PROJ-1239" });

interface Call {
  name: string;
  retryContext?: string;
  /** The skill the step was handed to, when one was. */
  skill?: string;
}

/**
 * A rung that answers with the outcome it was told to, and records what it
 * was asked.
 *
 * The recording is the point: the questions this suite answers are "who was
 * called, in what order, and what were they told about the one before them".
 */
function rung(name: string, harness: string, model: string, outcomes: AgentOutcome[], calls: Call[]): NamedAgent {
  let attempt = 0;

  const agentWith = (skill?: string): Agent => ({
    triage: async (): Promise<AgentResult<TriageOutcome>> => {
      calls.push({ name, skill });
      return agentResult<TriageOutcome>({ clear: true, questions: [], at: AT }, { outcome: next(), harness, model });
    },
    implement: async (_t, retryContext?: string): Promise<AgentResult<AttemptOutcome>> => {
      calls.push({ name, retryContext, skill });
      return agentResult<AttemptOutcome>(
        { ok: true, output: "pushed", at: AT },
        { outcome: next(), harness, model, output: `${name} said its piece` },
      );
    },
    addressThreads: async () => {
      calls.push({ name, skill });
      return agentResult([], { outcome: next(), harness, model });
    },
  });

  function next(): AgentOutcome {
    const outcome = outcomes[Math.min(attempt, outcomes.length - 1)]!;
    attempt += 1;
    return outcome;
  }

  return { name, harness, model, agent: agentWith(), using: (skill) => agentWith(skill) };
}

function relayOf(
  calls: Call[],
  plan: [string, string, string, AgentOutcome[]][],
  skills?: Record<string, string[]>,
) {
  const log = new RecordingEventLog();
  const ladder = plan.map(([name, harness, model, outcomes]) =>
    rung(name, harness, model, outcomes, calls),
  );

  return {
    log,
    relay: new AgentRelay(ladder, {
      log,
      skills,
      now: () => new Date("2026-09-03T12:00:00Z"),
    }),
  };
}

describe("what the relay does with the outcome it gets", () => {
  it("asks one agent and stops when that agent worked", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["completed"]],
      ["claude:opus", "claude", "opus", ["completed"]],
    ]);

    const result = await relay.implement(TICKET);

    expect(calls.map((c) => c.name)).toEqual(["claude:sonnet"]);
    expect(result.run.outcome).toBe("completed");
    expect(log.of("agent.handoff")).toHaveLength(0);
  });

  it("escalates a failure to the stronger model of the same harness", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["failed"]],
      ["claude:opus", "claude", "opus", ["completed"]],
      ["codex:gpt-5", "codex", "gpt-5", ["completed"]],
    ]);

    await relay.implement(TICKET);

    expect(calls.map((c) => c.name)).toEqual(["claude:sonnet", "claude:opus"]);
    expect(log.of("agent.handoff")[0]?.detail).toMatchObject({
      cause: "failed",
      moved: "model",
      from: { harness: "claude", model: "sonnet" },
      to: { harness: "claude", model: "opus" },
    });
  });

  it("sends a rate limit to another harness, skipping the rest of the throttled one", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["rate-limited"]],
      ["claude:opus", "claude", "opus", ["completed"]],
      ["codex:gpt-5", "codex", "gpt-5", ["completed"]],
    ]);

    await relay.implement(TICKET);

    expect(calls.map((c) => c.name)).toEqual(["claude:sonnet", "codex:gpt-5"]);
    expect(log.of("agent.handoff")[0]?.detail).toMatchObject({ cause: "rate-limited", moved: "harness" });
  });

  it("hands back the last outcome once every rung is spent, so the workflow can escalate", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["failed"]],
      ["codex:gpt-5", "codex", "gpt-5", ["failed"]],
    ]);

    const result = await relay.implement(TICKET);

    expect(calls).toHaveLength(2);
    expect(result.run.outcome).toBe("failed");
    // Two rungs tried means exactly one move between them.
    expect(log.of("agent.handoff")).toHaveLength(1);
  });

  it("does not start another agent after an abandoned run", async () => {
    // The handbrake guarantee. `amy stop` kills the child mid-run, and if the
    // relay treated that as a failure it would immediately raise a fresh
    // process on the next harness.
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["abandoned"]],
      ["codex:gpt-5", "codex", "gpt-5", ["completed"]],
    ]);

    const result = await relay.implement(TICKET);

    expect(calls.map((c) => c.name)).toEqual(["claude:sonnet"]);
    expect(result.run.outcome).toBe("abandoned");
    expect(log.of("agent.handoff")).toHaveLength(0);
  });
});

describe("the handoff", () => {
  it("tells the next agent it is picking up half-done work", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["rate-limited"]],
      ["codex:gpt-5", "codex", "gpt-5", ["completed"]],
    ]);

    await relay.implement(TICKET);

    const handoff = calls[1]?.retryContext ?? "";
    expect(handoff).toContain("claude");
    expect(handoff).toContain("ran out of quota partway through");
    expect(handoff).toContain("do not begin again");
    // What the cut-off agent actually said travels with it, because that is
    // the difference between continuing and restarting.
    expect(handoff).toContain("claude:sonnet said its piece");
  });

  it("keeps the caller's own retry context alongside it", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["failed"]],
      ["claude:opus", "claude", "opus", ["completed"]],
    ]);

    await relay.implement(TICKET, "the gate failed on lint");

    expect(calls[1]?.retryContext).toContain("the gate failed on lint");
    expect(calls[1]?.retryContext).toContain("did not succeed");
  });

  it("carries nothing on the first attempt", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(calls, [["claude", "claude", "", ["completed"]]]);

    await relay.implement(TICKET);

    expect(calls[0]?.retryContext).toBeUndefined();
  });
});

describe("the other two methods relay the same way", () => {
  it("escalates triage", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["failed"]],
      ["claude:opus", "claude", "opus", ["completed"]],
    ]);

    const result = await relay.triage(TICKET);

    expect(calls).toHaveLength(2);
    expect(result.value).toEqual({ clear: true, questions: [], at: AT });
    expect(log.of("agent.handoff")[0]?.detail).toMatchObject({ action: "triage" });
  });

  it("escalates addressThreads", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(calls, [
      ["claude:sonnet", "claude", "sonnet", ["rate-limited"]],
      ["codex:gpt-5", "codex", "gpt-5", ["completed"]],
    ]);

    await relay.addressThreads(TICKET, [], "human");

    expect(calls).toHaveLength(2);
    // The action's name as the workflow and the config spell it, so the log,
    // the ladder and `skills:` are all one vocabulary.
    expect(log.of("agent.handoff")[0]?.detail).toMatchObject({ action: "address-threads" });
  });
});

it("refuses to exist with no agent to relay to", () => {
  // Mounting the port while owning nothing would turn a config mistake into a
  // mystery at the first ticket instead of an error at boot.
  expect(() => new AgentRelay([])).toThrow(/no harness plugin contributed/);
});

describe("a skill per step", () => {
  const SKILLS = { triage: ["first-skill", "second-skill"] };

  it("hands the step to the first skill named for it", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(calls, [["claude:sonnet", "claude", "sonnet", ["completed"]]], SKILLS);

    await relay.triage(TICKET);

    expect(calls).toEqual([{ name: "claude:sonnet", skill: "first-skill" }]);
  });

  it("asks nobody else once a skill answered", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(calls, [["claude:sonnet", "claude", "sonnet", ["completed"]]], SKILLS);

    await relay.triage(TICKET);

    expect(calls).toHaveLength(1);
  });

  it("moves to the next skill when the first did not answer", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(
      calls,
      [["claude:sonnet", "claude", "sonnet", ["failed", "completed"]]],
      SKILLS,
    );

    await relay.triage(TICKET);

    expect(calls.map((call) => call.skill)).toEqual(["first-skill", "second-skill"]);
    expect(log.of("agent.handoff")[0]?.detail).toMatchObject({
      action: "triage",
      cause: "failed",
      from: { skill: "first-skill" },
      to: { skill: "second-skill" },
      moved: "skill",
    });
  });

  it("exhausts the harnesses for one skill before trying the next", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(
      calls,
      [
        ["claude:sonnet", "claude", "sonnet", ["failed"]],
        ["codex:gpt-5", "codex", "gpt-5", ["failed", "completed"]],
      ],
      SKILLS,
    );

    await relay.triage(TICKET);

    // The two ladders answer different questions: which skill should do the
    // step, and what to do when the one asked could not.
    expect(calls).toEqual([
      { name: "claude:sonnet", skill: "first-skill" },
      { name: "codex:gpt-5", skill: "first-skill" },
      { name: "claude:sonnet", skill: "second-skill" },
      { name: "codex:gpt-5", skill: "second-skill" },
    ]);
  });

  it("starts no second skill after a run was cut off", async () => {
    const calls: Call[] = [];
    const { relay, log } = relayOf(
      calls,
      [["claude:sonnet", "claude", "sonnet", ["abandoned"]]],
      SKILLS,
    );

    // The handbrake. A killed child must not raise a fresh one under another
    // name, which is what a second skill would be.
    await relay.triage(TICKET);

    expect(calls).toHaveLength(1);
    expect(log.of("agent.handoff")).toHaveLength(0);
  });

  it("asks amy's own prompt for a step with no skill named", async () => {
    const calls: Call[] = [];
    const { relay } = relayOf(
      calls,
      [["claude:sonnet", "claude", "sonnet", ["completed"]]],
      SKILLS,
    );

    await relay.implement(TICKET);

    expect(calls).toEqual([{ name: "claude:sonnet", retryContext: undefined, skill: undefined }]);
  });
});
