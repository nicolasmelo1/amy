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
  // Under json a run killed before its envelope printed nothing on stdout; under
  // stream-json --verbose it printed every event, tool results included. The
  // ticket workflow puts a rate-limited run's output into the next prompt
  // (examples/workflow-ticket-to-qa/src/actions.ts, "Its partial reply was:"),
  // so a refusal before the result line ships the whole raw stream, file
  // contents and secrets from tool results included, into the rerun.
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

describe("HIGH: the recorded streams are not what S8 says they are", () => {
  // S8: "the fixtures are a real 2.1.322 stream recorded at execution". A2 and
  // A9 prove only as much as the recording is real; these ids are typed by
  // hand (sequential uuids, a placeholder session), so A2 compares the helper
  // envelope with a stream written to match it.
  it("the completed stream carries ids a real run generated, not placeholders", () => {
    const ids = lines(recorded("completed")).map((line) => JSON.parse(line) as { uuid?: string });

    for (const { uuid } of ids) {
      expect(uuid, "a sequential placeholder uuid is not a recording").not.toMatch(/-0000-4000-8000-0000000000\d\d$/);
    }
  });
});

describe("MEDIUM: the refused recording is not the completed one with status and resetsAt edited", () => {
  // S8: "the rejected one is that recording with its status and resetsAt
  // edited". Here session ids, uuids and message ids differ too, so the pair
  // no longer isolates the one change the proof is about.
  it("differs from the completed recording only in rate_limit_info.status and resetsAt", () => {
    const strip = (stdout: string) =>
      lines(stdout).map((line) => {
        const parsed = JSON.parse(line) as { type?: string; rate_limit_info?: Record<string, unknown> };
        if (parsed.type === "rate_limit_event" && parsed.rate_limit_info) {
          const { status: _s, resetsAt: _r, ...rest } = parsed.rate_limit_info;
          return { ...parsed, rate_limit_info: rest };
        }
        return parsed;
      });

    expect(strip(recorded("rate-limited"))).toEqual(strip(recorded("completed")));
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

    for (const field of ["text", "tokens", "costUsd", "model", "durationMs"]) {
      expect(scenario, `the scenario never checks completed.${field}`).toMatch(new RegExp(`completed\\.${field}|deepStrictEqual\\(\\s*completed\\s*,`));
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
