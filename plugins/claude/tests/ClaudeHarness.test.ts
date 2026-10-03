import { describe, it, expect } from "vitest";
import { CommandResult } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { ClaudeHarness } from "../src/ClaudeHarness.js";

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

/**
 * The claude harness on its own: a prompt and a directory in, an answer and
 * its account out. What a step puts in the prompt and does with the answer
 * is the workflow's, and is tested there.
 *
 * Every claim here is about what reached the command line, which is the
 * contract that survives either side being rewritten.
 */
function harnessFor(
  scripts: { match: (c: string, a: readonly string[]) => boolean; result: Partial<CommandResult> }[],
  config: { model?: string; timeoutMs?: number } = {},
) {
  const runner = new ScriptedRunner(scripts);
  const harness = new ClaudeHarness(runner, { model: config.model, timeoutMs: config.timeoutMs });
  const ask = (prompt = "Ticket PROJ-1239: total is wrong") => harness.ask(prompt, "/w/northwind/northwind-backend");
  return { runner, ask };
}

describe("how it calls the CLI", () => {
  it("asks for JSON, which is what makes the run measurable", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask();

    expect(runner.argvFor("claude")).toEqual(["--output-format", "json", "-p"]);
  });

  it("selects the model with the long flag the CLI actually accepts", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())], { model: "sonnet" });

    await ask();

    expect(runner.argvFor("claude")).toEqual(["--model", "sonnet", "--output-format", "json", "-p"]);
  });

  it("streams the prompt over stdin, in the directory it was handed", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask("Ticket PROJ-1239: total is wrong");

    const call = runner.callsTo("claude")[0]!;
    expect(call.options?.cwd).toBe("/w/northwind/northwind-backend");
    expect(call.options?.stdin).toContain("PROJ-1239");
  });

  it("hands back the answer the envelope carried, and nothing of the envelope", async () => {
    const { ask } = harnessFor([claudeReturns(envelope({ result: '{"clear": true}' }))]);

    expect((await ask()).text).toBe('{"clear": true}');
  });
});

describe("what it says the run took", () => {
  it("reads the token counts off the envelope", async () => {
    const { ask } = harnessFor([claudeReturns(envelope())]);

    const { run } = await ask();

    expect(run.tokens).toEqual({ input: 2, output: 4, cacheRead: 10617, cacheWrite: 7551 });
  });

  it("trusts the cost the harness reported, because it knows the plan", async () => {
    const { ask } = harnessFor([claudeReturns(envelope())]);

    const { run } = await ask();

    expect(run.costUsd).toBeCloseTo(0.0809285, 10);
    expect(run.costSource).toBe("reported");
  });

  it("works the cost out from the table when the harness did not say", async () => {
    const stripped = JSON.stringify({
      ...(JSON.parse(envelope()) as Record<string, unknown>),
      total_cost_usd: undefined,
    });

    const { ask } = harnessFor([claudeReturns(stripped)]);
    const { run } = await ask();

    // sonnet-4-5, under the threshold: 2*3e-6 + 4*1.5e-5 + 10617*3e-7 + 7551*3.75e-6
    expect(run.costSource).toBe("computed");
    expect(run.costUsd).toBeCloseTo(2 * 3e-6 + 4 * 1.5e-5 + 10617 * 3e-7 + 7551 * 3.75e-6, 10);
  });

  it("leaves the cost absent for a model nothing can price", async () => {
    // Absent beats inventing a rate that a budget then spends against.
    const unknown = envelope({ total_cost_usd: undefined, modelUsage: { "some-model-nobody-priced": {} } });

    const { ask } = harnessFor([claudeReturns(unknown)]);
    const { run } = await ask();

    expect(run.costSource).toBe("unknown");
    expect(run.costUsd).toBeUndefined();
  });

  it("reports the model the run actually used, decorations and all", async () => {
    const { ask } = harnessFor([claudeReturns(envelope())], { model: "sonnet" });

    const { run } = await ask();

    // What was asked for was `sonnet`; what ran is what modelUsage is keyed by.
    expect(run.model).toBe("claude-sonnet-4-5[1m]");
    expect(run.harness).toBe("claude");
  });

  it("prefers the duration the envelope measured over the wall clock", async () => {
    const { ask } = harnessFor([claudeReturns(envelope())]);

    expect((await ask()).run.durationMs).toBe(3411);
  });
});

describe("how it classifies a run", () => {
  it("calls a clean envelope completed", async () => {
    const { ask } = harnessFor([claudeReturns(envelope())]);

    expect((await ask()).run.outcome).toBe("completed");
  });

  it("calls a 429 rate-limited, not failed", async () => {
    // The two want opposite responses: another harness, not a bigger model.
    const { ask } = harnessFor([claudeReturns(envelope({ api_error_status: 429 }))]);

    expect((await ask()).run.outcome).toBe("rate-limited");
  });

  it("calls an envelope that says it errored failed", async () => {
    const { ask } = harnessFor([claudeReturns(envelope({ is_error: true }))]);

    expect((await ask()).run.outcome).toBe("failed");
  });

  it("calls output that is not an envelope at all abandoned", async () => {
    // The harness was missing, or it was killed. Either way nothing ran, and
    // a rate limit that prints no envelope will land here until its shape is
    // known, which is honest rather than clever.
    const { ask } = harnessFor([claudeReturns("command not found: claude", false)]);

    expect((await ask()).run.outcome).toBe("abandoned");
  });

  it("never touches git: answering is all a harness does", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask();

    expect(runner.calls.every((call) => call.command === "claude")).toBe(true);
  });
});
