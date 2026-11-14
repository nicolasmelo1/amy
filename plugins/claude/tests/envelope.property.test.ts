import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ClaudeStream, classifyStream, parseStream } from "../src/envelope.js";

/**
 * The mutations these properties must reject.
 *
 * `rejected_read_only_on_the_last_line` is the harness that looks for a
 * refusal only in the line before the result, which is where a finished
 * stream usually puts nothing. `a_warning_reads_as_a_limit` is the one that
 * treats `allowed_warning` as a refusal, so a run at 90% of its quota is
 * escalated instead of done.
 */
const LAST_ONLY = "rejected_read_only_on_the_last_line";
const WARNING = "a_warning_reads_as_a_limit";
const planted = process.env.SF_FALSIFIER ?? "";

const REFUSED = { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1_893_456_000 } } as const;
const ALLOWED = { type: "rate_limit_event", rate_limit_info: { status: "allowed", utilization: 0.4 } } as const;
const WARNED = { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", utilization: 0.9 } } as const;
const THROTTLED = { type: "result", subtype: "error", is_error: false, api_error_status: 429, result: "done" } as const;
const FINISHED = { type: "result", subtype: "success", is_error: false, api_error_status: null, result: "done" } as const;
const INIT = { type: "system", subtype: "init" } as const;

/**
 * Reads a stream, or the run the falsifier names.
 *
 * The mutation has to live beside the property: the point of a falsifier is
 * that the test is red when the wrong reader is planted, so it is written
 * here rather than in the source under test.
 */
function readStream(stdout: string): ClaudeStream {
  const parsed = parseStream(stdout);

  if (planted === LAST_ONLY) {
    const lines = stdout.split("\n").filter((line) => line.trim().startsWith("{"));
    const last = parseStream(lines.at(-1) ?? "");
    return { result: parsed.result, rejected: last.rejected, throttled: last.throttled, ...(last.resetsAt === undefined ? {} : { resetsAt: last.resetsAt }) };
  }

  if (planted === WARNING) {
    return { ...parsed, rejected: parsed.rejected || stdout.includes('"status":"allowed_warning"') };
  }

  return parsed;
}

/** One event a line, as the CLI prints them. */
function streamOf(lines: readonly object[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

describe("a limit, for any stream", () => {
  it("is read wherever in the stream it is said", () => {
    // One result line, as a real run prints, with any events around it: the
    // refusal may come before or after the line that ends the run.
    const event = fc.constantFrom(REFUSED, ALLOWED, WARNED, INIT);
    const events = fc
      .tuple(
        fc.array(event, { maxLength: 4 }),
        fc.constantFrom(REFUSED, ALLOWED, WARNED, THROTTLED, FINISHED, INIT),
        fc.array(event, { maxLength: 4 }),
      )
      .map(([before, one, after]) => [...before, one, ...after]);

    fc.assert(
      fc.property(events, (lines) => {
        const parsed = readStream(streamOf(lines));
        const limited = lines.includes(REFUSED) || lines.includes(THROTTLED);

        expect(classifyStream(parsed, true) === "rate-limited").toBe(limited);
      }),
      { numRuns: 300 },
    );
  });

  it("is never said by a warning", () => {
    const events = fc.array(fc.constantFrom(ALLOWED, WARNED, INIT, FINISHED), { minLength: 1, maxLength: 6 });

    fc.assert(
      fc.property(events, (lines) => {
        expect(classifyStream(readStream(streamOf(lines)), true)).not.toBe("rate-limited");
      }),
      { numRuns: 200 },
    );
  });
});
