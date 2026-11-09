---
base: 2ada639e99779a3cb8d04b054f9da66c3f7108a9
sources:
  - { id: S1, kind: code, ref: "plugins/codex/src/CodexHarness.ts", said: "classify reads exit code and turn completion; its comment says a rate limit reads as failed. Hermes says the same" }
  - { id: S2, kind: decision, said: "do not invent the rate-limit distinction from stderr text; with no structured signal, a harness stays failed" }
  - { id: S3, kind: code, ref: "packages/agent-kit/src/ladder.ts", said: "a rate-limited rung hands the half-done tree to the next harness; a one-harness ladder has none, so the run ends as an attempt" }
  - { id: S4, kind: reference, ref: "docs/design/waiting-is-not-trying.md", said: "an action returning { notATry: true, retryAfterMs } moves the charged attempt to looks in the same save" }
  - { id: S5, kind: reference, ref: "https://github.com/openai/codex", said: "codex exec --json reduces a turn error to a message; the app-server protocol types it as codexErrorInfo usageLimitExceeded or rateLimitExceeded, and reads limits with account/rateLimits/read" }
  - { id: S7, kind: decision, said: "the Codex harness runs codex app-server as a child over stdio JSON-RPC instead of codex exec --json, so a limit arrives typed; no port or daemon, so it runs wherever exec ran. Decided 2026-11-05" }
  - { id: S8, kind: decision, said: "the protocol's types are generated from the installed codex with generate-json-schema and kept as a fixture, so a release that moves a field fails a test, not a run" }
  - { id: S9, kind: reference, ref: "plugins/hermes-agent/src/HermesHarness.ts", symbol: "classify", said: "Hermes reads usage.failed only; on a provider 429 Hermes knows failure_reason rate_limit and failure_resets_at, but its usage file drops both" }
  - { id: S10, kind: decision, said: "amy reads failure_reason and failure_resets_at from the usage file when present, waiting on upstream rather than proposing it; a Hermes without them stays failed. Decided 2026-11-05" }
  - { id: S12, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/pull/104211", said: "an open upstream pull request adds failure_reason and failure_retryable to the usage file; failure_resets_at is not in it" }
  - { id: S11, kind: decision, said: "Codex and Hermes both, the harnesses one operator runs on subscriptions. Decided 2026-11-05" }
  - { id: S6, kind: decision, said: "no-retry-is-free does not count a rate-limited wait: a wait adds no evidence and spends nothing" }
touches:
  - plugins/codex/src/**
  - plugins/codex/tests/**
  - plugins/hermes-agent/src/HermesHarness.ts
  - plugins/hermes-agent/tests/HermesHarness.test.ts
  - packages/core/src/ports/CommandRunner.ts
  - packages/core/src/NodeCommandRunner.ts
  - packages/cli/src/add.ts
  - packages/cli/tests/assemble.test.ts
  - packages/cli/tests/add.test.ts
  - packages/agent-kit/src/ladder.ts
  - plugins/serial-engine/tests/Worker.test.ts
  - packages/workflow-ticket-to-qa/src/**
  - packages/workflow-ticket-to-qa/tests/**
  - packages/workflow-testkit/src/**
  - scripts/docs/sources/packages.ts
  - docs/concepts/ports.md
  - docs/reference/contracts.md
  - docs/design/a-usage-limit-is-not-an-attempt.md
criteria:
  - { id: A1, statement: "recorded app-server turn errors carrying usageLimitExceeded or rateLimitExceeded classify as rate-limited with their reset; any other turn error still as failed", proof: "test:plugins/codex/tests/CodexHarness.test.ts", sources: [S1, S2, S5, S7, S11], done: true }
  - { id: A6, statement: "a run on the app-server harness gives the same reply, cost and outcome as on exec for a recorded completed and a recorded failed turn", proof: "test:plugins/codex/tests/CodexHarness.test.ts", sources: [S7, S8], done: true }
  - { id: A7, statement: "a Hermes usage file with failure_reason rate_limit classifies as rate-limited, waiting until failure_resets_at or the policy backoff without it; one without failure_reason, failed as today", proof: "test:plugins/hermes-agent/tests/HermesHarness.test.ts", sources: [S9, S10, S11, S12], done: true }
  - { id: A2, statement: "a ladder ending on rate-limited records no attempt, and attemptsIn is unchanged", proof: "property:examples/workflow-ticket-to-qa/tests/attempts.property.test.ts#limit_charged_as_attempt", sources: [S3, S4], done: true }
  - { id: A3, statement: "the step waits until the reported reset time, or the policy's backoff when none, then runs again on the tree it left", proof: "test:examples/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts", sources: [S3, S4], done: true }
  - { id: A4, statement: "with two attempts allowed, limited twice then failed twice escalates after the second failure, not the second limit", proof: "test:examples/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts", sources: [S3], done: true }
  - { id: A5, statement: "a limited run preserves the no-evidence streak; genuine unchanged runs still park at budget.progress.maxUnchanged", proof: "test:plugins/serial-engine/tests/Worker.test.ts", sources: [S4, S6], done: true }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "A1, A6, A7" }
  - { mechanism: attempts-and-waits, answer: works, proof: "A2, A3" }
  - { mechanism: budget-and-evidence, answer: works, proof: "A5" }
  - { mechanism: record-migration, answer: works, proof: "test:examples/workflow-ticket-to-qa/tests/usage-limit.integration.test.ts" }
  - { mechanism: workflow-tooling, answer: n/a, why: "the testkit only gains a walkthrough; its walking is unchanged" }
  - { mechanism: install-and-update, answer: works, proof: "test:packages/cli/tests/add.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "managed spawn changes only how a host cancels children; no tracker or code-host capability changes" }
guarantee:
  - { holds: "a run Codex or Hermes reports limited through a structured field charges no attempt and waits", not_against: "a Hermes release without the keys, or a provider reporting its limit only in prose: it reads as failed, as today" }
  - { holds: "the step reruns after the reported reset, or the policy backoff when none", not_against: "a reset time the provider reports wrong, or a local clock off from the provider's" }
  - { holds: "a single-rung ladder survives any number of limits", not_against: "a limit that never lifts: the step keeps waiting and nobody is escalated" }
  - { holds: "the rerun continues on the tree the limited run left", not_against: "the checkout edited by hand while the step waits" }
failures:
  - { step: Codex, when: "the installed codex speaks a protocol the fixture does not match", goes_to: "the harness fails at boot naming the version, never mid-run" }
  - { step: Hermes classify, when: "the usage file has no failure_reason", goes_to: "Hermes stays failed, as today" }
  - { step: last rung, when: rate-limited, goes_to: "wait until reset or backoff; the same step reruns on the tree it left, the handoff note saying it continues" }
cut:
  - "guessing a rate limit from stderr prose: refused (S2)"
deviations:
  - "Review extended the CommandRunner with managed spawn so app-server cancellation uses the host lifecycle; the original declaration named no core change."
  - "Review required a persisted continuation note for the half-finished tree, so record-migration changed from n/a to a compatible optional field."
  - "Review added bounded shutdown, UTF-8 stream handling, streamed partial replies, total-token accounting, and mount-time 0.166 protocol validation within the declared Codex boundary."
  - "The documentation stand-in now reports the captured compatible Codex version because plugin registration validates it before contributing mounts."
  - "docs/reference/configuration.md: generated earlier in the PR; this review did not change its source."
  - "docs/reference/plugins.md: generated earlier in the PR; this review did not change its source."
  - "docs/start/installation.md: generated earlier in the PR; this review did not change its source."
  - "package-lock.json: release metadata changed earlier in the PR; this review did not regenerate it."
  - "package.json: release metadata changed earlier in the PR; this review did not change it."
  - "packages/core/src/agent-run.ts: the original delivery changed agent accounting; this review did not alter it."
  - "packages/test-fixtures/contracts/github-rest.json.gz: contract data changed earlier in the PR; this review did not alter it."
  - "packages/test-fixtures/contracts/manifest.json: contract metadata changed earlier in the PR; this review did not alter it."
  - "packages/workflow-ticket-to-qa/package.json: release metadata changed earlier in the PR; this review did not alter it."
  - "plugins/codex/README.md: generated earlier in the PR; this review did not alter it."
  - "plugins/hermes-agent/src/index.ts: the original delivery exported its classification changes; this review did not alter it."
exit: "a workflow allowing two attempts, on a single Codex rung or a Hermes rung reporting the keys, survives any number of usage limits and escalates only after two runs that actually failed"
---
# A usage limit is not an attempt

Codex and Hermes classify only structured usage limits. A limited implementation
waits without saving an attempt, head, commit, or evidence, retaining only a
continuation note for the half-finished tree. The declaration above preserves
the delivered criteria, current proofs, scope, and review-driven deviations.
