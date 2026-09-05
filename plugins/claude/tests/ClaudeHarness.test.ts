import { describe, it, expect } from "vitest";
import { CommandResult, Git } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { HarnessAgent } from "@amykit/agent-kit";
import { ClaudeHarness } from "../src/ClaudeHarness.js";
import { ticket } from "@amykit/test-fixtures";

const layout = { workspaceRoot: "/w/northwind", defaultBranch: "dev" };

/**
 * The envelope `claude -p --output-format json` prints, shaped from a real
 * one. Everything the accounting reads comes from here rather than from
 * stderr, which is the whole point of asking for JSON.
 */
function envelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    api_error_status: null,
    stop_reason: null,
    result: "done",
    duration_ms: 3411,
    total_cost_usd: 0.0809285,
    usage: {
      input_tokens: 2,
      output_tokens: 4,
      cache_read_input_tokens: 10617,
      cache_creation_input_tokens: 7551,
    },
    modelUsage: { "claude-sonnet-4-5[1m]": { costUSD: 0.0809285 } },
    ...overrides,
  });
}

function claudeReturns(stdout: string, ok = true) {
  return {
    match: (command: string) => command === "claude",
    result: { stdout, exitCode: ok ? 0 : 1 } as Partial<CommandResult>,
  };
}

function treeIsDirty(dirty: boolean) {
  return {
    match: (command: string, args: readonly string[]) => command === "git" && args[0] === "status",
    result: { stdout: dirty ? " M src/invoice.ts" : "" } as Partial<CommandResult>,
  };
}

/**
 * The claude agent as it is actually assembled: the harness knows the CLI and
 * the shared `HarnessAgent` knows the prompts and the git dance.
 *
 * The split is why these tests still assert on `runner`. Every claim here is
 * about what reached the command line, which is the contract that survives
 * either half being rewritten.
 */
function agentFor(
  scripts: { match: (c: string, a: readonly string[]) => boolean; result: Partial<CommandResult> }[],
  config: { model?: string; timeoutMs?: number; reviewerHints?: Record<string, string> } = {},
) {
  const runner = new ScriptedRunner(scripts);
  const harness = new ClaudeHarness(runner, { model: config.model, timeoutMs: config.timeoutMs });

  return {
    runner,
    agent: new HarnessAgent(harness, new Git(runner, layout), {
      reviewerHints: config.reviewerHints,
    }),
  };
}

describe("how it calls the CLI", () => {
  it("asks for JSON, which is what makes the run measurable", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    await agent.triage(ticket());

    expect(runner.argvFor("claude")).toEqual(["--output-format", "json", "-p"]);
  });

  it("selects the model with the long flag the CLI actually accepts", async () => {
    const { runner, agent } = agentFor(
      [claudeReturns(envelope({ result: '{"clear": true}' }))],
      { model: "sonnet" },
    );

    await agent.triage(ticket());

    expect(runner.argvFor("claude")).toEqual(["--model", "sonnet", "--output-format", "json", "-p"]);
  });

  it("streams the prompt over stdin, in the ticket's own checkout", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    await agent.triage(ticket());

    const call = runner.callsTo("claude")[0]!;
    expect(call.options?.cwd).toBe("/w/northwind/northwind-backend");
    expect(call.options?.stdin).toContain("PROJ-1239");
  });
});

describe("what it says the run took", () => {
  it("reads the token counts off the envelope", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    const { run } = await agent.triage(ticket());

    expect(run.tokens).toEqual({ input: 2, output: 4, cacheRead: 10617, cacheWrite: 7551 });
  });

  it("trusts the cost the harness reported, because it knows the plan", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    const { run } = await agent.triage(ticket());

    expect(run.costUsd).toBeCloseTo(0.0809285, 10);
    expect(run.costSource).toBe("reported");
  });

  it("works the cost out from the table when the harness did not say", async () => {
    const without = envelope({ result: '{"clear": true}' });
    const stripped = JSON.stringify({
      ...(JSON.parse(without) as Record<string, unknown>),
      total_cost_usd: undefined,
    });

    const { agent } = agentFor([claudeReturns(stripped)]);
    const { run } = await agent.triage(ticket());

    // sonnet-4-5, under the threshold: 2*3e-6 + 4*1.5e-5 + 10617*3e-7 + 7551*3.75e-6
    expect(run.costSource).toBe("computed");
    expect(run.costUsd).toBeCloseTo(2 * 3e-6 + 4 * 1.5e-5 + 10617 * 3e-7 + 7551 * 3.75e-6, 10);
  });

  it("leaves the cost absent for a model nothing can price", async () => {
    // Absent beats inventing a rate that a budget then spends against.
    const unknown = envelope({
      result: '{"clear": true}',
      total_cost_usd: undefined,
      modelUsage: { "some-model-nobody-priced": {} },
    });

    const { agent } = agentFor([claudeReturns(unknown)]);
    const { run } = await agent.triage(ticket());

    expect(run.costSource).toBe("unknown");
    expect(run.costUsd).toBeUndefined();
  });

  it("reports the model the run actually used, decorations and all", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))], {
      model: "sonnet",
    });

    const { run } = await agent.triage(ticket());

    // What was asked for was `sonnet`; what ran is what modelUsage is keyed by.
    expect(run.model).toBe("claude-sonnet-4-5[1m]");
    expect(run.harness).toBe("claude");
  });

  it("prefers the duration the envelope measured over the wall clock", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    const { run } = await agent.triage(ticket());

    expect(run.durationMs).toBe(3411);
  });
});

describe("how it classifies a run", () => {
  it("calls a clean envelope completed", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    expect((await agent.triage(ticket())).run.outcome).toBe("completed");
  });

  it("calls a 429 rate-limited, not failed", async () => {
    // The two want opposite responses: another harness, not a bigger model.
    const { agent } = agentFor([
      claudeReturns(envelope({ result: '{"clear": true}', api_error_status: 429 })),
    ]);

    expect((await agent.triage(ticket())).run.outcome).toBe("rate-limited");
  });

  it("calls an envelope that says it errored failed", async () => {
    const { agent } = agentFor([
      claudeReturns(envelope({ result: '{"clear": true}', is_error: true })),
    ]);

    expect((await agent.triage(ticket())).run.outcome).toBe("failed");
  });

  it("calls output that is not an envelope at all abandoned", async () => {
    // The harness was missing, or it was killed. Either way nothing ran, and
    // a rate limit that prints no envelope will land here until its shape is
    // known, which is honest rather than clever.
    const { agent } = agentFor([claudeReturns("command not found: claude", false)]);

    expect((await agent.implement(ticket())).run.outcome).toBe("abandoned");
  });
});

describe("triage", () => {
  it("reports a clear ticket", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    const { value } = await agent.triage(ticket());

    expect(value.clear).toBe(true);
    expect(value.questions).toEqual([]);
  });

  it("collects the blocking questions", async () => {
    const { agent } = agentFor([
      claudeReturns(
        envelope({ result: '{"clear": false, "questions": ["Does a write-off reduce it?"]}' }),
      ),
    ]);

    const { value } = await agent.triage(ticket());

    expect(value.questions).toEqual(["Does a write-off reduce it?"]);
  });

  it("ignores questions on a ticket it called clear", async () => {
    const { agent } = agentFor([
      claudeReturns(envelope({ result: '{"clear": true, "questions": ["idle musing"]}' })),
    ]);

    expect((await agent.triage(ticket())).value.questions).toEqual([]);
  });
});

describe("implement", () => {
  it("gets onto the ticket's branch before writing anything", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope()), treeIsDirty(true)]);

    await agent.implement(ticket());

    const order = runner.calls.map((call) => `${call.command} ${call.args[0]}`);
    expect(order.indexOf("git fetch")).toBeLessThan(order.indexOf("claude --output-format"));
  });

  it("commits and pushes what the agent left behind", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope()), treeIsDirty(true)]);

    const { value } = await agent.implement(ticket());

    expect(value.ok).toBe(true);
    expect(runner.calls.some((c) => c.command === "git" && c.args[0] === "push")).toBe(true);
  });

  it("calls a clean exit that changed nothing a failure", async () => {
    const { agent } = agentFor([claudeReturns(envelope()), treeIsDirty(false)]);

    const { value, run } = await agent.implement(ticket());

    expect(value.ok).toBe(false);
    expect(value.output).toContain("without changing any file");
    // And the account says failed too, so a relay can act on it.
    expect(run.outcome).toBe("failed");
  });

  it("reports a failing agent without trying to push", async () => {
    const { runner, agent } = agentFor([
      claudeReturns(envelope({ is_error: true, result: "exploded" })),
    ]);

    const { value } = await agent.implement(ticket());

    expect(value.ok).toBe(false);
    expect(value.output).toContain("exploded");
    expect(runner.calls.some((c) => c.args[0] === "push")).toBe(false);
  });

  it("hands the previous failure back verbatim", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope()), treeIsDirty(true)]);

    await agent.implement(ticket(), "lint: 3 problems in src/invoice.ts");

    const prompt = runner.callsTo("claude")[0]!.options?.stdin ?? "";
    expect(prompt).toContain("lint: 3 problems in src/invoice.ts");
    expect(prompt).toContain("A previous attempt did not hold");
  });

  it("says nothing about a previous attempt on the first try", async () => {
    const { runner, agent } = agentFor([claudeReturns(envelope()), treeIsDirty(true)]);

    await agent.implement(ticket());

    expect(runner.callsTo("claude")[0]!.options?.stdin).not.toContain("previous attempt");
  });
});

describe("addressThreads", () => {
  const threads = [
    { id: "T1", author: "edsger", body: "why a new variable?", isResolved: false, isOutdated: false },
    { id: "T2", author: "edsger", body: "delete this guard", isResolved: false, isOutdated: false },
  ];

  const verdicts = (json: string) => claudeReturns(envelope({ result: json }));

  it("returns a verdict for every comment it was given", async () => {
    const { agent } = agentFor([
      verdicts(
        '{"verdicts":[{"threadId":"T1","verdict":"fixed","note":"inlined it"},{"threadId":"T2","verdict":"disagreed","note":"the guard covers a real case"}]}',
      ),
      treeIsDirty(true),
    ]);

    const { value } = await agent.addressThreads(ticket(), threads, "human");

    expect(value).toEqual([
      { threadId: "T1", verdict: "fixed", note: "inlined it" },
      { threadId: "T2", verdict: "disagreed", note: "the guard covers a real case" },
    ]);
  });

  it("pushes an unanswered comment to the owner instead of dropping it", async () => {
    const { agent } = agentFor([
      verdicts('{"verdicts":[{"threadId":"T1","verdict":"fixed","note":"inlined it"}]}'),
      treeIsDirty(true),
    ]);

    const { value } = await agent.addressThreads(ticket(), threads, "human");

    expect(value[1]).toEqual({
      threadId: "T2",
      verdict: "disagreed",
      note: "the agent did not answer this comment",
    });
  });

  it("accepts that answering a comment may need no code change", async () => {
    const { agent } = agentFor([
      verdicts('{"verdicts":[{"threadId":"T1","verdict":"disagreed","note":"already correct"}]}'),
      treeIsDirty(false),
    ]);

    const { value } = await agent.addressThreads(ticket(), [threads[0]!], "human");

    expect(value).toHaveLength(1);
  });

  it("puts the reviewer's known habits in the prompt", async () => {
    const { runner, agent } = agentFor(
      [verdicts('{"verdicts":[]}'), treeIsDirty(false)],
      { reviewerHints: { edsger: "Delete anything that is not needed." } },
    );

    await agent.addressThreads(ticket(), threads, "human");

    expect(runner.callsTo("claude")[0]!.options?.stdin).toContain("not needed");
  });

  it("says whether the comments came from a bot or a person", async () => {
    const { runner, agent } = agentFor([verdicts('{"verdicts":[]}'), treeIsDirty(false)]);

    await agent.addressThreads(ticket(), threads, "automated");

    expect(runner.callsTo("claude")[0]!.options?.stdin).toContain("An automated reviewer");
  });

  it("reports the cause rather than throwing when the agent dies", async () => {
    // It used to throw here. It cannot: a relay above reads the run to decide
    // whether another harness gets a turn, and an exception would skip the
    // whole escalation at the exact moment it is needed.
    const { agent } = agentFor([claudeReturns(envelope({ is_error: true, result: "boom" }))]);

    const result = await agent.addressThreads(ticket(), threads, "human");

    expect(result.run.outcome).toBe("failed");
    // No verdict is invented for a run that produced none. The engine is what
    // refuses the action, so an empty list is never read as "no comment
    // needed answering".
    expect(result.value).toEqual([]);
  });

  it("reports the cause rather than throwing when triage dies", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ is_error: true, result: "boom" }))]);

    const result = await agent.triage(ticket());

    expect(result.run.outcome).toBe("failed");
    expect(result.value.questions).toEqual([]);
  });
});

describe("the cache write split", () => {
  /**
   * Taken from a real envelope. Every cache write in that run had the
   * one-hour time to live, which is billed at twice the input rate: ignoring
   * the split undercounted the computed cost by 60%.
   */
  const realSplit = {
    input_tokens: 2,
    output_tokens: 9,
    cache_read_input_tokens: 19123,
    cache_creation_input_tokens: 10232,
    cache_creation: { ephemeral_1h_input_tokens: 10232, ephemeral_5m_input_tokens: 0 },
  };

  it("reads the one-hour part of a cache write", async () => {
    const { agent } = agentFor([
      claudeReturns(envelope({ result: '{"clear": true}', usage: realSplit })),
    ]);

    const { run } = await agent.triage(ticket());

    expect(run.tokens).toMatchObject({ cacheWrite: 10232, cacheWrite1h: 10232 });
  });

  it("computes the higher cost that split implies", async () => {
    const stripped = envelope({ result: '{"clear": true}', usage: realSplit });
    const withoutCost = JSON.stringify({
      ...(JSON.parse(stripped) as Record<string, unknown>),
      total_cost_usd: undefined,
      modelUsage: { "claude-sonnet-4-5": {} },
    });

    const { agent } = agentFor([claudeReturns(withoutCost)]);
    const { run } = await agent.triage(ticket());

    // 10232 at twice the input rate, not at the cache-write rate.
    const oneHour = 10232 * 3e-6 * 2;
    const asIfFiveMinute = 10232 * 3.75e-6;
    expect(run.costUsd).toBeCloseTo(2 * 3e-6 + 9 * 1.5e-5 + 19123 * 3e-7 + oneHour, 10);
    expect(run.costUsd).toBeGreaterThan(asIfFiveMinute);
  });

  it("says nothing about the split when the envelope does not", async () => {
    const { agent } = agentFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    const { run } = await agent.triage(ticket());

    expect("cacheWrite1h" in (run.tokens ?? {})).toBe(false);
  });
});
