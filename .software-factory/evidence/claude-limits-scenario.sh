#!/bin/sh
# The `claude-limits` gate's scenario, as a repeatable run.
#
# Drives the built plugin from another process over the recorded streams: the
# completed one must read exactly as the json envelope did, and the refused one
# must be rate-limited with the reset its rate_limit_event reported, whatever
# its result line says.
#
# Usage: claude-limits-scenario.sh [report-path]
#
# Nothing here needs a credential: the streams are recorded fixtures.
set -eu

report=${1:-.software-factory/evidence/claude-limits-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repo"

npm run build >/dev/null
npx vitest run \
  plugins/claude/tests/ClaudeHarness.test.ts \
  plugins/claude/tests/envelope.property.test.ts >/dev/null

node --input-type=module - "$repo" "$report" <<'NODE'
import { deepStrictEqual } from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [repo, report] = process.argv.slice(2);
const built = (name) => import(pathToFileURL(`${repo}/plugins/${name}/dist/index.js`).href);
const claude = await built("claude");
const recorded = (name) => readFileSync(`${repo}/plugins/claude/tests/fixtures/stream-${name}.jsonl`, "utf8");

// A fixed clock, so the wait is the fixture's reset and not the wall clock.
const now = Date.parse("2026-11-14T12:00:00.000Z");
const completed = claude.parseRun(recorded("completed"), true, "sonnet", now);
const refused = claude.parseRun(recorded("rate-limited"), true, "sonnet", now);

// A2 and A9: the whole completed account, not only its outcome — the answer,
// the tokens, the cost the harness reported, the model and the duration.
deepStrictEqual(completed, {
  outcome: "completed",
  text: "done",
  model: "claude-sonnet-4-5[1m]",
  tokens: { input: 2, output: 4, cacheRead: 10617, cacheWrite: 7551 },
  costUsd: 0.0809285,
  costSource: "reported",
  durationMs: 3411,
});
// The same recording read as the json envelope the stream ended with, which is
// what `--output-format json` printed before the harness moved to the stream.
const envelope = recorded("completed").trim().split("\n").at(-1);
deepStrictEqual(claude.parseRun(envelope, true, "sonnet", now), completed);
deepStrictEqual(refused.outcome, "rate-limited");
deepStrictEqual(refused.retryAfterMs, 1_893_456_000 * 1000 - now);

const assertions = [{ type: "claude.a_rejected_limit_waits_for_its_reset", status: "passed" }];
writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "claude-limits",
      status: "passed",
      goal: "A Claude run its plan refused reads as rate-limited, carrying the reset the stream reported, through the built plugin.",
      artifact: { entry: "the built @amykit/plugin-claude from its dist/index.js, over the recorded streams" },
      observed: { assertions_run: assertions.length, assertions_failed: 0 },
      assertions,
    },
    null,
    2,
  )}\n`,
);
NODE
