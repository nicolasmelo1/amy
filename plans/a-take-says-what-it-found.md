---
base: b4dcb412776da14bcbdb0b783afe24631d5174b2
sources:
  - { id: S1, kind: code, ref: "packages/core/src/process-lock.ts", symbol: "takeLock", said: "a take that buried an abandoned owner's lock and one that found the path free answer the same HeldLock, so no caller can tell a recovered claim from a released one" }
  - { id: S2, kind: code, ref: "packages/cli/src/auto-update.ts", symbol: "takeDaemonUpdate", said: "it reads the claim's owner and asks whether its pid lives before taking the lock, so an owner that settles, releases and exits in between reads as an update to run again" }
  - { id: S3, kind: ticket, said: "2026-11-20: a reaper settles the due, releases and exits while a starter sits between its read and its take; the starter runs the same update twice for one due (daemon-update-take.test.ts)" }
  - { id: S4, kind: decision, said: "what a gone owner left is read from the take itself: it reports whether it buried an owner, and a lock found free was released by an owner that finished. Decided 2026-11-20" }
touches:
  - packages/cli/src/auto-update.ts
  - packages/cli/tests/daemon-update-take.test.ts
  - packages/cli/tests/daemon-update-recovery.test.ts
  - packages/cli/tests/daemon-update-claim.property.test.ts
  - packages/core/src/process-lock.ts
  - packages/core/tests/process-lock.property.test.ts
criteria:
  - { id: A1, statement: "a take answers whether it buried an abandoned owner or found the path free, and a lock released before the take is never a takeover", proof: "deferred:test:packages/core/tests/process-lock.property.test.ts", sources: [S1, S4] }
  - { id: A2, statement: "the daemon's update runs only for a claim the take recovered: a claim its owner finished and released, whether that owner still lives or has exited since, leaves no due behind", proof: "deferred:property:packages/cli/tests/daemon-update-claim.property.test.ts#recover_acts_on_a_stale_read", sources: [S2, S3, S4] }
crosses:
  - { mechanism: process-locks, answer: works, proof: "deferred:A1" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A2" }
guarantee:
  - { holds: "one due runs one update, whatever the starter read before it took the claim", not_against: "a crash between the claim and the update, which no record on disk tells from an update that ran" }
failures:
  - { step: take, when: "the claim's owner finished and released while the starter looked", goes_to: "the starter takes a free claim, leaves no due and runs nothing" }
  - { step: take, when: "the claim's owner is gone", goes_to: "the take buries it, writes the due back and the update runs once" }
exit: "process-lock.property proves a take says what it found, and daemon-update-claim.property proves a released owner's due is not run again while a gone owner's still is"
---

# A take says what it found

A starter decided a claim was abandoned from a liveness read taken before the
lock, so an owner that settled, released and exited in between made it run the
same update twice for one due. The take now says whether it buried an owner or
found the path free, and only a buried claim is an update to recover.
