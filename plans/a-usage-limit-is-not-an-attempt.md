---
sources:
  - { id: S1, kind: code, ref: "plugins/codex/src/CodexHarness.ts", said: "classify reads exit code and turn completion; its comment says a rate limit reads as failed. Hermes says the same" }
  - { id: S2, kind: decision, said: "do not invent the rate-limit distinction from stderr text; with no structured signal, Codex stays failed" }
  - { id: S3, kind: code, ref: "packages/agent-kit/src/ladder.ts", said: "a rate-limited rung hands the half-done tree to the next harness; a one-harness ladder has none, so the run ends as an attempt" }
  - { id: S4, kind: reference, ref: "docs/design/waiting-is-not-trying.md", said: "an action returning { notATry: true, retryAfterMs } moves the charged attempt to looks in the same save" }
  - { id: S5, kind: decision, said: "the work first captures a real limited run of codex exec --json, finds the structured field saying so (an error event's code, a status printed as data, a documented exit code), and records it as a fixture" }
  - { id: S6, kind: decision, said: "no-retry-is-free does not count a rate-limited wait: a wait adds no evidence and spends nothing" }
touches:
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/**
  - packages/agent-kit/src/ladder.ts
  - packages/workflow-ticket-to-qa/src/**
  - packages/workflow-ticket-to-qa/tests/machine.test.ts
  - packages/workflow-ticket-to-qa/tests/retry.test.ts
  - packages/workflow-testkit/src/**
criteria:
  - { id: A1, statement: "a recorded limited Codex run classifies as rate-limited; a recorded failed one still as failed", proof: "unspecified:which field carries the signal is the first thing the work finds; the fixture is the check once it is known", sources: [S1, S2, S5] }
  - { id: A2, statement: "a ladder ending on rate-limited records no attempt, and attemptsIn is unchanged", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S3, S4] }
  - { id: A3, statement: "the step waits until the reported reset time, or the policy's backoff when none, then runs again on the tree it left", proof: "deferred:walkthrough in the testkit", sources: [S3, S4] }
  - { id: A4, statement: "with two attempts allowed, limited twice then failed twice escalates after the second failure, not the second limit", proof: "deferred:walkthrough in the testkit", sources: [S3] }
  - { id: A5, statement: "a limited run spends nothing against no-retry-is-free's no-evidence count", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/retry.test.ts", sources: [S4, S6] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "unspecified:A1's recorded fixture" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A5" }
  - { mechanism: record-migration, answer: n/a, why: "no record shape changes; a wait is a look already counted" }
  - { mechanism: workflow-tooling, answer: n/a, why: "the testkit only gains a walkthrough; its walking is unchanged" }
failures:
  - { step: Codex classify, when: "no structured limit signal exists in codex exec --json", goes_to: "Codex stays failed; the plan records that" }
  - { step: last rung, when: rate-limited, goes_to: "wait until reset or backoff; the same step reruns on the tree it left, the handoff note saying it continues" }
cut:
  - "guessing a rate limit from stderr prose: refused (S2)"
exit: "a workflow allowing two attempts, on a single Codex rung, survives any number of usage limits and escalates only after two runs that actually failed"
---
# A usage limit is not an attempt

A person on a subscription loses half of a two-attempt budget to the clock: Codex never reports a limit, and a limit on the last rung is spent as an attempt.
