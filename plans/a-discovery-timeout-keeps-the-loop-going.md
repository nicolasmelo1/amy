---
base: 176c7c4adbaf856478175a8e2756ecca470c36de
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/daemon.ts", symbol: "runLoop", said: "await loop.turn() escapes the loop when discovery rejects, so a recoverable HTTP deadline ends the foreground daemon" }
  - { id: S2, kind: code, ref: "packages/cli/src/index.ts", said: "the daemon turn calls onePass(engine), whose discovery is the Linear HTTP path before the tick" }
  - { id: S3, kind: decision, said: "a deadline is recoverable at the daemon boundary: report it, wait one idle interval and keep driving; errors outside the recoverable transport failure remain visible. Decided 2026-11-17" }
touches:
  - packages/cli/src/daemon.ts
  - packages/cli/tests/daemon.test.ts
  - packages/core/src/http.ts
  - packages/core/src/index.ts
  - registry/cli.json
  - registry/core.json
criteria:
  - { id: A1, statement: "when a daemon turn rejects with the recoverable deadline error, the loop reports it, waits its idle interval and runs a later turn", proof: "deferred:test:packages/cli/tests/daemon.test.ts", sources: [S1, S2, S3] }
  - { id: A2, statement: "a daemon turn rejecting with an unrelated error still rejects", proof: "deferred:test:packages/cli/tests/daemon.test.ts", sources: [S1, S3] }
crosses:
  - { mechanism: engines, answer: works, proof: "deferred:A1" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A1" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A1" }
  - { mechanism: events-and-notifications, answer: n/a, why: "the loop's error boundary changes; notification delivery does not" }
guarantee:
  - { holds: "a recoverable discovery deadline does not end the foreground daemon", not_against: "an error outside the declared recoverable class" }
failures:
  - { step: discover, when: "the transport reaches its deadline", goes_to: "the loop reports the failure, sleeps one idle interval and tries the next pass" }
exit: "the daemon test proves both retrying the recoverable deadline and rethrowing an unrelated error"
---

# A discovery timeout keeps the loop going

The daemon treats its recoverable transport deadline as one failed pass, rather than a process exit. It waits before retrying and keeps unrelated programming errors visible.

The deadline is core's own error, so the loop can tell a server that stopped answering from a defect of its own.
