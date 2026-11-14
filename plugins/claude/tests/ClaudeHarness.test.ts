import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { CommandResult, HostServices, mount } from "@amykit/core";
import { Granted, harnessConformance, nextRung } from "@amykit/agent-kit";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { ClaudeHarness, ISOLATED, WRITING_MODES, lend } from "../src/ClaudeHarness.js";
import { parseRun } from "../src/envelope.js";
import { plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-11-11T12:00:00.000Z"),
  paths: { state: "/state" },
};

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

/**
 * The recorded stream of a run, one JSON event a line, as the CLI printed it.
 *
 * The completed one is the shape 2.1.322 emits for a turn that finished; the
 * refused one is the same stream with its rate_limit_event edited to the
 * refusal the CLI reports, until a real refusal is captured.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const stream = (name: "completed" | "rate-limited") =>
  fs.readFileSync(path.join(HERE, "fixtures", `stream-${name}.jsonl`), "utf8");

/** The reset the refused recording reports, in epoch seconds. */
const RESET = 1_893_456_000;

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
  it("asks for the stream, which is where a limit and its reset are said", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask();

    expect(runner.argvFor("claude")).toEqual(["--permission-mode", "acceptEdits", ...ISOLATED, "--output-format", "stream-json", "--verbose", "-p"]);
  });

  it("selects the model with the long flag the CLI actually accepts", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())], { model: "sonnet" });

    await ask();

    expect(runner.argvFor("claude")).toEqual(["--model", "sonnet", "--permission-mode", "acceptEdits", ...ISOLATED, "--output-format", "stream-json", "--verbose", "-p"]);
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

describe("the stream the CLI prints", () => {
  it("gives a completed run the same account the json envelope gave", () => {
    // The result line is the envelope: same answer, tokens, cost, model and
    // duration, read from the stream the run actually printed.
    expect(parseRun(stream("completed"), true, "sonnet")).toEqual(parseRun(envelope(), true, "sonnet"));
  });

  it("calls a run its plan refused rate-limited, whatever its result line says, and waits until the reset", () => {
    const now = Date.parse("2026-11-14T12:00:00.000Z");
    const parsed = parseRun(stream("rate-limited"), true, "sonnet", now);

    expect(parsed.outcome).toBe("rate-limited");
    // The result line in the recording is a success; the event settles it.
    expect(parsed.text).toBe("done");
    expect(parsed.retryAfterMs).toBe(RESET * 1000 - now);
  });

  it("hands the reset it was told to the relay", async () => {
    const { ask } = harnessFor([claudeReturns(stream("rate-limited"))]);

    const { run } = await ask();

    expect(run.outcome).toBe("rate-limited");
    expect(Math.abs((run.retryAfterMs ?? 0) - (RESET * 1000 - Date.now()))).toBeLessThan(60_000);
  });

  it("calls a rejected event with no reset rate-limited, with the policy backoff to wait", () => {
    const rejected = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "rejected" } });

    const parsed = parseRun(`${rejected}\n${envelope()}`, true, "sonnet");

    expect(parsed.outcome).toBe("rate-limited");
    expect(parsed.retryAfterMs).toBeUndefined();
  });

  it("reads a stream with no result line and no rejected event as a missing envelope did", () => {
    const init = JSON.stringify({ type: "system", subtype: "init" });

    expect(parseRun(init, true, "sonnet").outcome).toBe("completed");
    expect(parseRun(init, false, "sonnet").outcome).toBe("abandoned");
  });

  it("keeps a run amy stop killed abandoned, and starts no next rung", () => {
    // Every line before the result: the child was killed mid-run.
    const killed = stream("completed").split("\n").slice(0, 3).join("\n");
    const ladder = [
      { name: "sonnet", harness: "claude", model: "sonnet" },
      { name: "opus", harness: "claude", model: "opus" },
      { name: "gpt-5", harness: "codex", model: "gpt-5" },
    ];
    const parsed = parseRun(killed, false, "sonnet");

    expect(parsed.outcome).toBe("abandoned");
    expect(nextRung(ladder, 0, parsed.outcome)).toBeNull();
  });

  it("keeps a run that was refused before the kill rate-limited", () => {
    const killed = stream("rate-limited").split("\n").slice(0, 3).join("\n");

    expect(parseRun(killed, false, "sonnet").outcome).toBe("rate-limited");
  });
});

describe("a step that must change nothing", () => {
  it("runs in plan mode, which the CLI enforces, only when the step asks to", async () => {
    const runner = new ScriptedRunner([claudeReturns(envelope()), claudeReturns(envelope())]);
    const harness = new ClaudeHarness(runner);

    await harness.ask("why did it fail?", "/w", { readOnly: true });
    await harness.ask("implement it", "/w");

    const [readOnly, writing] = runner.callsTo("claude");
    expect(readOnly!.args.join(" ")).toContain("--permission-mode plan");
    expect(writing!.args.join(" ")).toContain("--permission-mode acceptEdits");
  });
});

/** What a run's arguments let it do, as the CLI reads `--permission-mode`. */
function grantedBy(args: readonly string[] | undefined): Granted {
  const at = args?.indexOf("--permission-mode") ?? -1;
  const mode = at >= 0 ? args![at + 1] : undefined;
  if (mode === undefined) return "nothing";
  return (WRITING_MODES as readonly string[]).includes(mode) ? "write" : "read-only";
}

describe("a step that may write", () => {
  it("passes the configured writing mode, and conforms as a harness whatever writing mode is set", async () => {
    for (const permissionMode of WRITING_MODES) {
      const findings = await harnessConformance(() => {
        const runner = new ScriptedRunner([claudeReturns(envelope())]);
        return { harness: new ClaudeHarness(runner, { permissionMode }), granted: () => grantedBy(runner.callsTo("claude")[0]?.args) };
      });
      expect(findings).toEqual([]);
    }
  });

  it("is refused at mount under a mode that is empty, unknown or cannot write, naming the setting and the writing modes", async () => {
    for (const permissionMode of ["", "manual", "plan", "dontAsk", "yolo"]) {
      const outcome = await mount([plugin], { "@amykit/plugin-claude": { permissionMode } }, HOST);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? "" : outcome.problems.join("\n")).toContain(
        `permissionMode is ${JSON.stringify(permissionMode)}, under which a run cannot write: set it to \`acceptEdits\`, \`auto\`, \`bypassPermissions\``,
      );
    }
  });

  it("mounts with acceptEdits when nothing is set", async () => {
    expect((await mount([plugin], {}, HOST)).ok).toBe(true);
  });
});

describe("a run apart from the operator's own Claude", () => {
  it("loads only the repository's settings, no MCP server it was not given, and keeps no session", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask();

    const args = runner.argvFor("claude");
    expect(args.join(" ")).toContain("--setting-sources project,local");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(args).not.toContain("--mcp-config");
  });

  it("lends the step's skill, and only it, for the length of the run", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amy-claude-test-"));
    const installed = path.join(tmp, "installed", "factory-author");
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, "SKILL.md"), "---\nname: factory-author\n---\n");
    let seen: string[] = [];
    const runner = new ScriptedRunner([
      {
        match: (command, args) => {
          if (command !== "claude") return false;
          const lent = args[args.indexOf("--add-dir") + 1]!;
          seen = fs.readdirSync(path.join(lent, ".claude", "skills"));
          return true;
        },
        result: { stdout: envelope(), exitCode: 0 },
      },
    ]);
    const harness = new ClaudeHarness(runner, {}, tmp);

    await harness.ask("/factory-author\n\nwrite the gate", "/w", { skill: { name: "factory-author", path: installed } });

    const args = runner.argvFor("claude");
    const lent = args[args.indexOf("--add-dir") + 1]!;
    expect(seen).toEqual(["factory-author"]);
    expect(fs.existsSync(lent)).toBe(false);
    expect(fs.existsSync(path.join(installed, "SKILL.md"))).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("links the skill by its absolute place, so a relative skill root still lends it", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amy-claude-test-"));
    const previous = process.cwd();
    fs.mkdirSync(path.join(tmp, "skills", "logion"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "skills", "logion", "SKILL.md"), "x");
    process.chdir(tmp);
    try {
      const lent = lend(tmp, { name: "logion", path: "./skills/logion" })!;
      expect(fs.existsSync(path.join(lent, ".claude", "skills", "logion", "SKILL.md"))).toBe(true);
    } finally {
      process.chdir(previous);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("lends nothing when the step names no skill", async () => {
    const { runner, ask } = harnessFor([claudeReturns(envelope())]);

    await ask();

    expect(runner.argvFor("claude")).not.toContain("--add-dir");
  });

  it("goes ahead without a skill whose directory is gone", async () => {
    const { runner } = harnessFor([claudeReturns(envelope())]);
    const harness = new ClaudeHarness(runner);

    const reply = await harness.ask("/gone\n\nwork", "/w", { skill: { name: "gone", path: "/nowhere/gone" } });

    expect(reply.run.outcome).toBe("completed");
    expect(runner.argvFor("claude")).not.toContain("--add-dir");
  });

  it("returns the lent directory even when the run throws", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amy-claude-test-"));
    const installed = path.join(tmp, "installed", "logion");
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, "SKILL.md"), "x");
    const runner = { run: async () => { throw new Error("spawn failed"); } };
    const harness = new ClaudeHarness(runner as never, {}, tmp);

    await expect(harness.ask("p", "/w", { skill: { name: "logion", path: installed } })).rejects.toThrow("spawn failed");

    expect(fs.readdirSync(tmp)).toEqual(["installed"]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("where the harness's own skills are (A10)", () => {
  it("says ~/.claude/skills, where Claude Code installs them", () => {
    const runner = { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) };
    expect(new ClaudeHarness(runner).skillsDirectory).toBe(path.join(os.homedir(), ".claude", "skills"));
  });
});

describe("a skill is lent by place", () => {
  it("says it can be handed one, so the chat may address a skill to it", () => {
    const harness = new ClaudeHarness({ run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) });

    expect(harness.lendsSkill).toBe(true);
  });
});
