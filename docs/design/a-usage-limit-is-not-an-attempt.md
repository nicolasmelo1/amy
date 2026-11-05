# A usage limit is not an attempt

Codex now uses `codex app-server` over stdio JSON-RPC. Its typed
`usageLimitExceeded` and `rateLimitExceeded` errors are the only Codex signals
that classify as rate-limited; error prose remains failed. The harness reads
the earliest account rate-limit reset when Codex reports one.

Hermes now reads optional `failure_reason=rate_limit` and
`failure_resets_at` usage-file keys. Missing keys preserve the former failed
classification.

A rate-limited implementation stores `{ notATry: true, retryAfterMs }`, so the
engine refunds the action and waits. It does not commit, read the branch head,
or save an implementation result before the next look.

## Delivered criteria

- [x] A1 Structured Codex usage-limit errors classify as rate-limited; other errors fail. (proof: test:plugins/codex/tests/CodexHarness.test.ts)
- [x] A6 Completed and failed app-server turns preserve the former harness reply outcome. (proof: test:plugins/codex/tests/CodexHarness.test.ts)
- [x] A7 Hermes rate-limit keys wait to reset or fall back; missing keys fail. (proof: test:plugins/hermes-agent/tests/HermesHarness.test.ts)
- [x] A2 A rate-limited implementation refunds the charged attempt. (proof: property:packages/workflow-ticket-to-qa/tests/attempts.property.test.ts#limit_charged_as_attempt)
- [x] A3 A refunded implementation waits to its reported reset or policy backoff. (proof: test:packages/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts)
- [x] A4 Limits do not consume either of two allowed failed attempts. (proof: property:packages/workflow-ticket-to-qa/tests/retry.property.test.ts#limit_counted_as_unchanged)
- [x] A5 A limited run adds no no-retry evidence. (proof: test:packages/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts)
