---
base: 923afadbc96f70259f3a547c15d2fd4fbdaee170
sources:
  - { id: S1, kind: code, ref: "packages/core/src/process-lock.ts", symbol: "bury", said: "an abandoned lock is taken over by linking it to a tombstone named `<lock>.dead-<hash>` beside it, and that tombstone stands for an hour after the lock is buried" }
  - { id: S2, kind: code, ref: "packages/cli/src/index.ts", said: "`amy workflow list` counts every entry of a profile's records directory, so anything a writer left there is read as a record" }
  - { id: S3, kind: decision, said: "a file lock's tombstone goes with the burial that used it; a directory lock's tombstone is the lock moved aside and keeps its hour, or a late recoverer renames a new owner's lock. Decided 2026-11-18" }
touches:
  - packages/core/src/process-lock.ts
  - packages/core/tests/process-lock.test.ts
  - plugins/file-store/tests/a-store-holds-only-records.test.ts
  - registry/core.json
criteria:
  - { id: A1, statement: "a writer that takes over a record held by a process that died leaves the records directory holding only its records", proof: "deferred:test:plugins/file-store/tests/a-store-holds-only-records.test.ts", sources: [S1, S2, S3] }
  - { id: A2, statement: "burying a dead file lock leaves no tombstone beside it, while the tombstone holding a directory lock moved aside still stands", proof: "deferred:test:packages/core/tests/process-lock.test.ts", sources: [S1, S3] }
crosses:
  - { mechanism: process-locks, answer: works, proof: "deferred:A2" }
guarantee:
  - { holds: "nothing a writer needed to take its turn is left beside the records once it has taken it", not_against: "the tombstone that holds a directory lock moved aside, which stands until the sweep" }
failures:
  - { step: save, when: "the writer takes over a lock whose process died", goes_to: "it buries the lock, unlinks the file tombstone it used, and writes its record" }
exit: "the records directory test and the lock's own tombstone test pass without changing either expectation"
---

# A records directory holds only records

The records directory is what `amy workflow list` counts and what a person reads by hand. A takeover of a dead writer's lock uses a tombstone beside the record, and that tombstone stayed an hour, counted as a record and read as one.

A file lock's tombstone is only a second name for the lock, needed while the burial is decided, so it goes with the burial. A directory lock's tombstone is the lock itself moved aside and keeps its hour.
