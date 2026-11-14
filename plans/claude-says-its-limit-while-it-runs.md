---
base: bfd0826b9f23fb25ef6d1c7288a182f997b45e15
sources:
  - { id: S1, kind: code, ref: "plugins/claude/src/envelope.ts", symbol: "classify", said: "a Claude run is rate-limited only when api_error_status reads 429; its own comment says a limit with no envelope classifies as failed" }
  - { id: S2, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", symbol: "ask", said: "the harness runs claude -p --output-format json and reads one envelope after exit; it never reports a reset, so retryAfterMs stays empty" }
  - { id: S3, kind: reference, ref: "docs/design/a-usage-limit-is-not-an-attempt.md", said: "a limit is read only from a structured signal, never from error text; a rate-limited run charges no attempt and waits for its reset or the backoff" }
  - { id: S4, kind: reference, ref: "https://code.claude.com/docs/en/cli-reference", said: "print mode takes --output-format stream-json, which needs --verbose, and prints one JSON event a line, the last the result" }
  - { id: S5, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/brain.ts", symbol: "rate_limit_event", said: "each turn's rate_limit_event carries rate_limit_info: status rejected means the plan refused, whatever the result says, with resetsAt in epoch seconds" }
  - { id: S6, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/plan-usage.ts", symbol: "withRateLimit", said: "only rejected is a limit; allowed and allowed_warning carry utilization and are not" }
  - { id: S7, kind: decision, said: "the harness reads stream-json after exit, as it reads json today: the result line is the envelope, and a rejected rate_limit_event before it makes the run rate-limited. Proposed 2026-11-12" }
  - { id: S9, kind: code, ref: "packages/agent-kit/src/ladder.ts", symbol: "nextRung", said: "abandoned stops the ladder and failed tries the next rung, so a run amy stop killed must stay abandoned or a cancel starts another model" }
  - { id: S8, kind: decision, said: "pending: no credential reaches the implementer, so the fixtures are a 2.1.325 stand-in checked against the agent SDK types and the CLI binary, not a recording. Recording a real stream is on next-steps.md. Decided 2026-11-14" }
touches:
  - plugins/claude/src/envelope.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - plugins/claude/tests/envelope.property.test.ts
  - plugins/claude/tests/fixtures/stream-completed.jsonl
  - plugins/claude/tests/fixtures/stream-rate-limited.jsonl
  - examples/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts
  - examples/workflow-ticket-to-qa/tests/usage-limit.claude.integration.test.ts
  - examples/workflow-ticket-to-qa/package.json
  - plugins/claude/tests/stream.review.test.ts
  - packages/cli/tests/two-workflows.test.ts
  - registry/*.json
  - package-lock.json
  - docs/concepts/harnesses.md
  - docs/development/the-gate.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/claude-limits-scenario.sh
criteria:
  - { id: A1, statement: "the harness asks for --output-format stream-json with --verbose, keeping its model, mode, isolation and stdin prompt", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S2, S4] }
  - { id: A2, statement: "the recorded completed stream gives the same text, tokens, cost, model, duration and outcome the json envelope gave for that run", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S4, S7, S8] }
  - { id: A3, statement: "a stream with a rejected rate_limit_event is rate-limited with retryAfterMs to its resetsAt, whatever its result line says", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1, S3, S5, S7] }
  - { id: A4, statement: "for any stream, the outcome is rate-limited exactly when a rejected rate_limit_event or a 429 appears, wherever in the stream it is", proof: "deferred:property:plugins/claude/tests/envelope.property.test.ts#rejected_read_only_on_the_last_line", sources: [S3, S5, S6] }
  - { id: A5, statement: "allowed and allowed_warning events never make a run rate-limited", proof: "deferred:property:plugins/claude/tests/envelope.property.test.ts#a_warning_reads_as_a_limit", sources: [S6] }
  - { id: A6, statement: "a rejected event with no resetsAt is rate-limited with no retryAfterMs, so the policy backoff applies", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S3] }
  - { id: A7, statement: "a stream with no result line and no rejected event reads as a missing envelope does today: completed on a clean exit, abandoned otherwise", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1, S7] }
  - { id: A10, statement: "a run killed by amy stop before its result is abandoned and starts no next rung; a rejected event before the kill still makes it rate-limited", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S5, S9] }
  - { id: A8, statement: "a single Claude rung limited twice then failed twice escalates after the second failure, not the second limit, and waits until the reset", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/usage-limit.claude.integration.test.ts", sources: [S3] }
  - { id: A9, statement: "the built plugin, imported from dist in another process, classifies both recorded streams as A2 and A3 say", proof: "assertion:claude.a_rejected_limit_waits_for_its_reset", sources: [S3, S8] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A2, A3, A7, A10" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/usage-limit.claude.integration.test.ts" }
guarantee:
  - { holds: "a Claude run the plan refused, as its stream says, charges no attempt and waits for the reset it reported", not_against: "a Claude Code release that renames rate_limit_event or its fields: the run reads as failed, as today" }
  - { holds: "a run that completed reads exactly as it did under json", not_against: "a field present only in the json envelope and not on the result line" }
failures:
  - { step: parse, when: "a line is not JSON", goes_to: "skipped; the run is read from the lines that are" }
  - { step: classify, when: "resetsAt is in the past or unreadable", goes_to: "rate-limited with no retryAfterMs; the policy backoff applies" }
cut:
  - "stopping a run while it streams: a run that goes in circles stops"
  - "feeding usage windows from rate_limit_event to the usage reader: the reader is Claude's usage is read without its token"
  - "reading a limit from stderr or the result's prose (S3)"
exit: "a Claude run its plan refuses reads as rate-limited, charges no attempt, and the same step reruns after the reset Claude reported"
---
# Claude says its limit while it runs

The harness reads Claude Code's `stream-json` after exit: a rejected
`rate_limit_event` makes the run `rate-limited` with the reset it reported, and
a rejected window with `overageStatus: "allowed"` is no refusal — the turn runs
on credits and completes. The fixtures are a 2.1.325 stand-in, not a recording:
S8 stays pending until an authenticated CLI records one.
