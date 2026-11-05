---
base: 330ec3de00869241d24025edbd3b6a6eb5184f53
sources:
  - { id: S1, kind: friction, said: "2026-11-05: 'TBO-1396 is failing in HUMAN_REVIEW and I am retrying: gh api … unexpected end of JSON input' read as broken for good, needing an agent to fix it; it moved again on the next look" }
  - { id: S2, kind: code, ref: "plugins/serial-engine/src/Worker.ts", symbol: "failureNotice", said: "one warning on the first failure, silence in the middle, one at the ceiling; neither says how many tries are left" }
  - { id: S3, kind: code, ref: "plugins/serial-engine/src/config.ts", said: "maxItemAttempts defaults to 5 and retryDelayMs to five minutes, fixed" }
  - { id: S4, kind: decision, said: "the fixed delay stays: it is how amy works. Decided 2026-11-05" }
  - { id: S5, kind: decision, said: "the first warning says it is retrying, how many tries are left and when the next one is. Decided 2026-11-05" }
  - { id: S6, kind: decision, said: "serial-engine gains failureNotice: first | ceiling, default first; ceiling stays silent until the work is given up. Decided 2026-11-05" }
  - { id: S7, kind: code, ref: "packages/cli/src/index.ts", said: "a given-up record is released only by amy look <id>, which clears gaveUp" }
  - { id: S8, kind: decision, said: "the given-up message names amy look <id> as the way to put the work back" }
  - { id: S9, kind: code, ref: "plugins/github/src/GitHubCodeHost.ts", symbol: "gh", said: "any non-ok gh call throws; nothing retries a read that failed upstream" }
  - { id: S10, kind: decision, said: "a gh read that fails with an empty or cut JSON body, an HTTP 5xx or a network error is tried twice more at once before it throws; writes are never retried here. Decided 2026-11-05" }
touches:
  - plugins/serial-engine/src/Worker.ts
  - plugins/serial-engine/src/config.ts
  - plugins/serial-engine/src/plugin.ts
  - plugins/serial-engine/tests/Worker.announcements.test.ts
  - plugins/serial-engine/tests/Worker.failures.test.ts
  - plugins/github/src/GitHubCodeHost.ts
  - plugins/github/tests/GitHubCodeHost.test.ts
  - plugins/github/tests/gh-retry.property.test.ts
criteria:
  - { id: A1, statement: "the first failure's message says it is retrying, how many tries are left of maxItemAttempts and the time of the next look", proof: "deferred:test:plugins/serial-engine/tests/Worker.announcements.test.ts", sources: [S1, S2, S3, S4, S5] }
  - { id: A2, statement: "under failureNotice: ceiling, failures below the ceiling announce nothing and the ceiling announces once", proof: "deferred:test:plugins/serial-engine/tests/Worker.announcements.test.ts", sources: [S6] }
  - { id: A3, statement: "the given-up message names amy look <id>, and running it puts the work back on the queue", proof: "deferred:test:plugins/serial-engine/tests/Worker.failures.test.ts", sources: [S7, S8] }
  - { id: A4, statement: "a gh read failing twice with a transient error then succeeding returns the answer; a write or a 4xx is tried once", proof: "deferred:property:plugins/github/tests/gh-retry.property.test.ts#a_write_is_retried", sources: [S9, S10] }
crosses:
  - { mechanism: budget-and-evidence, answer: n/a, why: "only the wording and timing of the failure notice change; no budget check or evidence count is touched" }
  - { mechanism: engines, answer: works, proof: "deferred:A1, A2; the concurrent engine is the serial engine's Worker" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A1, A2, A3" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A4; writes are never retried by the wrapper" }
  - { mechanism: config, answer: works, proof: "deferred:A2; failureNotice is a typed key of serial-engine's slice" }
guarantee:
  - { holds: "a failure below the ceiling is announced at most once per fall, and the ceiling is announced exactly once, as an attempt on the notification channel", not_against: "a channel that rejects the message, which is logged as notify.failed and not resent; or two engines sharing a queue" }
  - { holds: "no gh write is ever sent twice by the retry", not_against: "a write gh itself retried before returning" }
failures:
  - { step: gh, when: "the third transient failure in a row", goes_to: "throws as today, and the look is retried after retryDelayMs" }
cut:
  - "backoff or jitter on retryDelayMs: refused (S4)"
  - "classifying errors so a transient one spends no engine attempt"
  - "the private workflow's own gh wrapper: its owner changes it there"
exit: "a ticket whose status check fails once says it is retrying with four tries left and when, failureNotice: ceiling stays silent until the fifth, and a blank gh read never reaches the queue"
---
# A failure says what is left

"Failing and retrying" reads as broken for good. The message says how many tries
are left, an operator can hear only the last one, and a blank read from GitHub is
asked again before it counts as a failure.
