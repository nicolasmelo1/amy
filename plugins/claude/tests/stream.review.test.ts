import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandResult } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { ClaudeHarness } from "../src/ClaudeHarness.js";
import { parseRun } from "../src/envelope.js";

/**
 * Review of PR #225 against plans/claude-says-its-limit-while-it-runs.md
 * (now docs/design/claude-says-its-limit-while-it-runs.md).
 *
 * Each describe is a severity; each red test is one finding, named by the
 * criterion, source, guarantee or exit line of the plan it breaks.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const recorded = (name: "completed" | "rate-limited") =>
  fs.readFileSync(path.join(HERE, "fixtures", `stream-${name}.jsonl`), "utf8");
const lines = (stdout: string) => stdout.split("\n").filter((line) => line.trim().startsWith("{"));
const event = (value: object) => JSON.stringify(value);

const INIT = event({ type: "system", subtype: "init", session_id: "s" });
const TOOL = event({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "API_KEY=sk-live-should-never-reach-a-prompt\n".repeat(50) }] },
});
const REFUSED = (resetsAt?: number, rateLimitType = "five_hour") =>
  event({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType, ...(resetsAt === undefined ? {} : { resetsAt }) } });
const RESULT = (overrides: Record<string, unknown> = {}) =>
  event({ type: "result", subtype: "success", is_error: false, api_error_status: null, result: "done", ...overrides });

function harnessOver(stdout: string, ok: boolean) {
  const runner = new ScriptedRunner([
    { match: (command: string) => command === "claude", result: { stdout, exitCode: ok ? 0 : 143 } as Partial<CommandResult> },
  ]);
  return new ClaudeHarness(runner, { model: "sonnet" });
}

/** A JSON event line, as the stream prints them, leaking into prose. */
const RAW_EVENT = /\{"type":"(system|user|assistant|rate_limit_event|result)"/;

describe("CRITICAL: a stream with no result line hands its raw events to the next prompt", () => {
  // A7 + guarantee "a run that completed reads exactly as it did under json".
  // Under json, a run killed before its envelope printed nothing; under
  // stream-json --verbose it printed every event, tool results included. The
  // ticket workflow puts a limited run's output into the next prompt
  // (examples/workflow-ticket-to-qa/src/actions.ts, "Its partial reply was:"),
  // so a refusal before the result line ships the raw stream, secrets and all.
  it("a refused run killed before its result gives no raw event as its text or output", async () => {
    const stdout = [INIT, TOOL, REFUSED(1_893_456_000)].join("\n");

    const { text, run } = await harnessOver(stdout, false).ask("p", "/w");

    expect(run.outcome).toBe("rate-limited");
    expect(text).not.toMatch(RAW_EVENT);
    expect(run.output).not.toMatch(RAW_EVENT);
    expect(run.output).not.toContain("sk-live-should-never-reach-a-prompt");
  });

  it("an abandoned run killed before its result gives no raw event as its output", async () => {
    const stdout = [INIT, TOOL].join("\n");

    const { run } = await harnessOver(stdout, false).ask("p", "/w");

    expect(run.outcome).toBe("abandoned");
    expect(run.output).not.toMatch(RAW_EVENT);
  });
});

describe("HIGH: a clean exit with no result line is not read as a missing envelope was", () => {
  // A7: "reads as a missing envelope does today". Today a missing envelope's
  // text is what the CLI printed that was not an envelope; the stream's own
  // event lines are not the answer.
  it("keeps only the lines that are not events as the answer", () => {
    const parsed = parseRun([INIT, "Error: something the CLI said in prose"].join("\n"), true, "sonnet");

    expect(parsed.outcome).toBe("completed");
    expect(parsed.text).toBe("Error: something the CLI said in prose");
  });
});

/**
 * A stand-in for Claude Code 2.1.325 in print mode, built from the CLI itself
 * rather than a recording (no credential reaches the implementer, so S8's real
 * recording stays pending). Verified against:
 * - @anthropic-ai/claude-agent-sdk 0.3.325 sdk.d.ts: SDKRateLimitEvent
 *   { type, rate_limit_info, uuid, session_id }; SDKRateLimitInfo.status is
 *   allowed | allowed_warning | rejected, resetsAt optional, overageStatus
 *   optional; SDKResultSuccess carries is_error and api_error_status.
 * - the 2.1.325 binary: rate_limit_info copies only the fields it has
 *   (resetsAt in epoch seconds, from anthropic-ratelimit-unified-reset); a 429
 *   becomes a synthetic assistant message with error "rate_limit" and text
 *   "You've hit your ... · resets ..."; the result line then has is_error true,
 *   the limit text as result and api_error_status 429; and a request is
 *   refused only when status is rejected and overageStatus is absent or
 *   rejected (with overage allowed the run goes on, on usage credits).
 */
const claude = (() => {
  const session = randomUUID();
  const line = (value: object) => event({ ...value, uuid: randomUUID(), session_id: session });
  const init = () =>
    line({ type: "system", subtype: "init", cwd: "/w", tools: ["Read"], mcp_servers: [], model: "claude-sonnet-4-5", permissionMode: "acceptEdits", slash_commands: [], apiKeySource: "none", claude_code_version: "2.1.325", output_style: "default", skills: [], plugins: [] });
  const limit = (info: Record<string, unknown>) => line({ type: "rate_limit_event", rate_limit_info: info });
  const said = (text: string, error?: string) =>
    line({ type: "assistant", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text }], stop_reason: null, usage: { input_tokens: 2, output_tokens: 4 } }, parent_tool_use_id: null, ...(error ? { error } : {}) });
  const result = (text: string, isError: boolean, status?: number) =>
    line({ type: "result", subtype: "success", is_error: isError, ...(status === undefined ? {} : { api_error_status: status }), duration_ms: 812, duration_api_ms: 640, num_turns: 1, result: text, stop_reason: null, total_cost_usd: 0.01, usage: { input_tokens: 2, output_tokens: 4 }, modelUsage: { "claude-sonnet-4-5": { inputTokens: 2, outputTokens: 4, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.01, contextWindow: 200000, maxOutputTokens: 32000 } }, permission_denials: [] });
  return {
    /** The plan refused the turn: the event, the synthetic reply, the error result. */
    refused(resetsAt: number) {
      const text = "You've hit your session limit · resets 3pm";
      return [init(), limit({ status: "rejected", resetsAt, rateLimitType: "five_hour", utilization: 1, isUsingOverage: false }), said(text, "rate_limit"), result(text, true, 429)].join("\n");
    },
    /** The plan window is spent but usage credits carry the turn: it completes. */
    onCredits(resetsAt: number) {
      return [init(), limit({ status: "rejected", resetsAt, rateLimitType: "five_hour", overageStatus: "allowed", isUsingOverage: true }), said("done"), result("done", false)].join("\n");
    },
  };
})();

describe("HIGH: the refused fixture is not what Claude prints when its plan refuses", () => {
  // S8 stays pending (no credential to record), so the fixture has to be the
  // stand-in's shape: a refusal is never a success result with is_error false.
  it("carries the synthetic rate_limit reply and a 429 error result, as 2.1.325 prints", () => {
    const events = lines(recorded("rate-limited")).map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events.some((e) => e.type === "assistant" && e.error === "rate_limit")).toBe(true);
    expect(events.find((e) => e.type === "result")).toMatchObject({ is_error: true, api_error_status: 429 });
  });

  it("every line of both fixtures belongs to the one session the init line opened", () => {
    for (const name of ["completed", "rate-limited"] as const) {
      const events = lines(recorded(name)).map((line) => JSON.parse(line) as { session_id?: string; uuid?: string });
      expect(new Set(events.map((e) => e.session_id)).size).toBe(1);
      expect(events.every((e) => typeof e.uuid === "string")).toBe(true);
    }
  });
});

describe("HIGH: a turn carried by usage credits reads as refused", () => {
  // Exit: "a Claude run its plan refuses reads as rate-limited". 2.1.325 does
  // not refuse when overageStatus is allowed: the turn runs on credits and
  // completes. Reading status alone throws the finished work away and reruns
  // the step after a reset that may be days off.
  it("is completed, with no wait, when overageStatus is allowed", () => {
    const now = Date.parse("2026-11-14T12:00:00.000Z");
    const parsed = parseRun(claude.onCredits(now / 1000 + 3_600), true, "sonnet", now);

    expect(parsed.outcome).toBe("completed");
    expect(parsed.retryAfterMs).toBeUndefined();
  });
});

describe("a refusal as the 2.1.325 stand-in prints it (A3, A6)", () => {
  it("is rate-limited, waits for the reset it reported, and answers with the limit text", () => {
    const now = Date.parse("2026-11-14T12:00:00.000Z");
    const resetsAt = now / 1000 + 3_600;

    for (const exitOk of [true, false]) {
      const parsed = parseRun(claude.refused(resetsAt), exitOk, "sonnet", now);
      expect(parsed.outcome).toBe("rate-limited");
      expect(parsed.retryAfterMs).toBe(3_600_000);
      expect(parsed.text).toBe("You've hit your session limit · resets 3pm");
    }
  });
});

describe("MEDIUM: a refusal reruns before every refused window has reopened", () => {
  // Exit: "the same step reruns after the reset Claude reported". When two
  // windows refuse, the run can only go again once both reopen; the last
  // event winning reruns into the window that is still shut.
  const now = Date.parse("2026-11-14T12:00:00.000Z");
  const inAnHour = now / 1000 + 3_600;
  const inAWeek = now / 1000 + 7 * 86_400;

  it("waits for the latest reset any rejected event reported", () => {
    const stdout = [REFUSED(inAWeek, "seven_day"), REFUSED(inAnHour, "five_hour"), RESULT()].join("\n");

    expect(parseRun(stdout, true, "sonnet", now).retryAfterMs).toBe(inAWeek * 1000 - now);
  });

  it("keeps a reset an earlier refusal reported when a later refusal reports none", () => {
    const stdout = [REFUSED(inAnHour), REFUSED(undefined), RESULT()].join("\n");

    expect(parseRun(stdout, true, "sonnet", now).retryAfterMs).toBe(inAnHour * 1000 - now);
  });
});

describe("LOW: A9's scenario proves the completed stream only by its outcome", () => {
  // A9: "classifies both recorded streams as A2 and A3 say". A2 is the same
  // text, tokens, cost, model and duration as the json envelope; the scenario
  // asserts only completed.outcome.
  it("compares the whole completed account the built plugin gives", () => {
    const scenario = fs.readFileSync(path.join(ROOT, ".software-factory/evidence/claude-limits-scenario.sh"), "utf8");

    // Each field's own assertion, or the whole-account comparison that covers
    // it: spelled as literals so the check itself reads as one.
    const covered = /deepStrictEqual\(\s*completed\s*,/;
    for (const [field, own] of [
      ["text", /completed\.text/],
      ["tokens", /completed\.tokens/],
      ["costUsd", /completed\.costUsd/],
      ["model", /completed\.model/],
      ["durationMs", /completed\.durationMs/],
    ] as const) {
      expect(scenario, `the scenario never checks completed.${field}`).toMatch(own.test(scenario) ? own : covered);
    }
  });
});

describe("LOW: a 429 is read only from the last result line", () => {
  // A4: "rate-limited exactly when a rejected rate_limit_event or a 429
  // appears, wherever in the stream it is". The property only ever generates
  // one result line, so an earlier throttled result is never tried.
  it("a throttled result before the final one still makes the run rate-limited", () => {
    const stdout = [RESULT({ subtype: "error", api_error_status: 429 }), RESULT()].join("\n");

    expect(parseRun(stdout, true, "sonnet").outcome).toBe("rate-limited");
  });
});
