import { describe, it, expect } from "vitest";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { CodexHarness, classify, messageOf, parseEvents, tokensOf } from "../src/index.js";

/**
 * The usage `turn.completed` carried on a real run, copied verbatim.
 *
 * The arithmetic is the reason this is a real capture rather than a made-up
 * one: `input_tokens` here is the **total**, and 17571 - 11008 = 6563 is the
 * part that was not served from cache. Hermes spells the same field the other
 * way round, so guessing was never an option.
 */
const REAL_USAGE = {
  input_tokens: 17571,
  cached_input_tokens: 11008,
  cache_write_input_tokens: 0,
  output_tokens: 5,
  reasoning_output_tokens: 0,
};

const REAL_STREAM = [
  JSON.stringify({ type: "thread.started", thread_id: "0199" }),
  JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
  JSON.stringify({ type: "turn.completed", usage: REAL_USAGE }),
].join("\n");

function harnessFor(stdout: string, ok = true, model?: string) {
  const runner = new ScriptedRunner([
    { match: (command) => command === "codex", result: { stdout, exitCode: ok ? 0 : 1 } },
  ]);

  return { runner, harness: new CodexHarness(runner, { model }) };
}

describe("how it calls the CLI", () => {
  it("asks for the JSON event stream and skips the trust prompt", async () => {
    const { runner, harness } = harnessFor(REAL_STREAM);

    await harness.ask("fix the invoice total", "/w/northwind/backend");

    const args = runner.argvFor("codex");
    expect(args.slice(0, 4)).toEqual(["exec", "--json", "--sandbox", "workspace-write"]);
    // Without this, an untrusted-directory prompt hangs a run nobody watches.
    expect(args).toContain("--skip-git-repo-check");
    // The trailing `-` is what makes codex read the prompt from stdin.
    expect(args.at(-1)).toBe("-");
  });

  it("puts the prompt on stdin rather than in the argument list", async () => {
    const { runner, harness } = harnessFor(REAL_STREAM);

    await harness.ask("fix the invoice total", "/w/northwind/backend");

    const call = runner.callsTo("codex")[0]!;
    expect(call.options?.stdin).toBe("fix the invoice total");
    expect(call.args.join(" ")).not.toContain("fix the invoice total");
    expect(call.options?.cwd).toBe("/w/northwind/backend");
  });

  it("names a model only when one was configured", async () => {
    const withModel = harnessFor(REAL_STREAM, true, "gpt-5");
    await withModel.harness.ask("go", "/w");
    expect(withModel.runner.argvFor("codex")).toContain("gpt-5");

    const without = harnessFor(REAL_STREAM);
    await without.harness.ask("go", "/w");
    expect(without.runner.argvFor("codex")).not.toContain("--model");
  });
});

describe("the tokens, against the convention codex actually uses", () => {
  it("subtracts the cached part out of the input total", () => {
    expect(tokensOf(parseEvents(REAL_STREAM))).toEqual({
      input: 6563,
      output: 5,
      cacheRead: 11008,
      cacheWrite: 0,
    });
  });

  it("still adds back up to the total codex reported", () => {
    const tokens = tokensOf(parseEvents(REAL_STREAM))!;
    // The check that catches the double-count: mapping input_tokens straight
    // across would make this 28579 and inflate every cost and budget.
    expect(tokens.input + tokens.cacheRead + tokens.cacheWrite).toBe(REAL_USAGE.input_tokens);
  });

  it("says nothing rather than zero when no event carried usage", () => {
    // Absent is the truth; zero is a number somebody would then add up.
    expect(tokensOf(parseEvents(JSON.stringify({ type: "thread.started" })))).toBeUndefined();
  });

  it("never goes negative if the counts disagree", () => {
    const odd = JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 99 },
    });

    expect(tokensOf(parseEvents(odd))?.input).toBe(0);
  });
});

describe("the cost", () => {
  it("computes from the vendored table and says so", async () => {
    const { harness } = harnessFor(REAL_STREAM, true, "gpt-5");

    const reply = await harness.ask("go", "/w");

    // 6563 input, 5 output and 11008 cache reads at the gpt-5 rates, worked
    // out by hand from specs.json.
    expect(reply.run.costUsd).toBeCloseTo(0.00962975, 10);
    expect(reply.run.costSource).toBe("computed");
  });

  it("admits it does not know when the model is not in the table", async () => {
    const { harness } = harnessFor(REAL_STREAM, true, "gpt-6-imaginary");

    const reply = await harness.ask("go", "/w");

    expect(reply.run.costUsd).toBeUndefined();
    expect(reply.run.costSource).toBe("unknown");
  });
});

describe("reading the stream", () => {
  it("takes the last thing the agent said as the answer", () => {
    const stream = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "thinking" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "the answer" } }),
    ].join("\n");

    expect(messageOf(parseEvents(stream))).toBe("the answer");
  });

  it("skips a line that is not JSON instead of giving up on the run", () => {
    // The envelope has changed shape more than once upstream, so a stray
    // line should cost the line and not the whole account.
    const noisy = ["warning: something", REAL_STREAM].join("\n");

    expect(tokensOf(parseEvents(noisy))?.input).toBe(6563);
  });
});

describe("which outcome it was", () => {
  it("completed when a turn finished and the agent spoke", () => {
    expect(classify(parseEvents(REAL_STREAM), true, true)).toBe("completed");
  });

  it("failed on a turn.failed event", () => {
    expect(classify(parseEvents(JSON.stringify({ type: "turn.failed" })), true, true)).toBe("failed");
  });

  it("failed on a non-zero exit", () => {
    expect(classify(parseEvents(REAL_STREAM), false, true)).toBe("failed");
  });

  it("failed when it exited cleanly having said nothing", () => {
    expect(classify(parseEvents(REAL_STREAM), true, false)).toBe("failed");
  });

  it("abandoned when there was no stream at all, which is a missing binary", () => {
    expect(classify([], false, false)).toBe("abandoned");
  });

  it("cannot tell a rate limit from a failure, and does not pretend to", async () => {
    // Codex publishes no quota status anywhere in the stream. Reporting
    // `rate-limited` would mean guessing from stderr text, which is exactly
    // what this design refuses. The relay still reaches another harness,
    // because a failure walks both axes.
    const { harness } = harnessFor("", false);

    const reply = await harness.ask("go", "/w");

    expect(reply.run.outcome).not.toBe("rate-limited");
  });
});
