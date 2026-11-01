---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Store.ts", said: "FileQueue.prune drops finished items past the queue plugin's retentionDays; plugin-file-store declares only a directory, and Store is load, save, all, with no delete, so a record stays on disk until removed by hand" }
  - { id: S2, kind: code, ref: "plugins/serial-engine/src/Worker.ts", said: "terminalStates is a list (a private workflow has DONE and REVIEW_POSTED; after a workflow is a Mermaid diagram, every state leading to [*]); Worker.discover refuses to re-enqueue work in one" }
  - { id: S3, kind: code, ref: "packages/cli/src/index.ts", said: "amy status counts ended work below the table and --all brings it back; that hides the record, it does not remove it, so the store grows as long as the machine runs" }
  - { id: S4, kind: decision, said: "deleting a record while the tracker still returns its id restarts the lifecycle: found() offers the id, no terminal record recognises it. The terminal record is the safeguard against rediscovery" }
  - { id: S5, kind: decision, said: "retiring means reaching an end; removal happens to an ended record later. Several terminal states need no ceremony: they differ in what happened, kept in the append-only log the budget is measured on, which outlives every record" }
  - { id: S6, kind: decision, said: "Store grows delete(workId), the missing primitive everything else needs" }
  - { id: S7, kind: decision, ref: "plugins/file-store/src/config.ts", said: "plugin-file-store grows retentionDays, mirroring and defaulting to the queue's so one number does not mean two things, and a prune removing terminal records older than it" }
  - { id: S8, kind: decision, said: "amy forget <workId> retires work by advancing it to a terminal state, a tombstone refusing rediscovery, not by deleting; the only non-restarting way out for work that cannot end on its own (removed ticket, gone PR)" }
  - { id: S9, kind: decision, said: "amy forget also drops the work's pending queue items, because a record that has ended has nothing due" }
touches:
  - packages/core/src/ports/Store.ts
  - plugins/file-store/src/FileStore.ts
  - plugins/file-store/src/config.ts
  - plugins/file-store/src/plugin.ts
  - plugins/file-store/tests/FileStore.test.ts
  - plugins/file-store/tests/prune.test.ts
  - packages/test-fixtures/src/fakes.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/forget.test.ts
  - plugins/serial-engine/tests/Worker.discover.test.ts
criteria:
  - { id: A1, statement: "Store.delete removes one record and leaves the rest", proof: "test:plugins/file-store/tests/FileStore.test.ts", sources: [S1, S6] }
  - { id: A2, statement: "a terminal record older than the retention is pruned", proof: "test:plugins/file-store/tests/prune.test.ts", sources: [S3, S7] }
  - { id: A3, statement: "a record that is not terminal is never pruned, however old", proof: "test:plugins/file-store/tests/prune.test.ts", sources: [S4, S7] }
  - { id: A4, statement: "amy forget on live work advances it to a terminal state, and the next discover does not enqueue it", proof: "test:plugins/serial-engine/tests/Worker.discover.test.ts", sources: [S2, S4, S8] }
  - { id: A5, statement: "amy forget drops that work's pending queue items", proof: "test:packages/cli/tests/forget.test.ts", sources: [S9] }
  - { id: A6, statement: "the event log still carries everything that happened to a record that has been pruned", proof: "test:packages/cli/tests/forget.test.ts", sources: [S5] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the Store port gains delete; no tracker or code host write is added" }
  - { mechanism: queue-and-store, answer: works, proof: "test:plugins/file-store/tests/prune.test.ts" }
guarantee:
  - { holds: "a record is pruned only in a terminal state past retention", not_against: "a non-terminal record of any age" }
  - { holds: "retired work is never rediscovered", not_against: "the tracker still returning its id, since forget leaves a terminal tombstone" }
cut:
  - "changing Worker.discover's refusal to re-enqueue terminal work: not touched; it is right as is"
  - "amy forget deleting the record: refused; deletion is retention's job (S8)"
  - "per-terminal-state handling of records: refused; the log keeps the difference (S5)"
exit: "a record that ended leaves the disk on its own, and one piece of work that will never finish on its own can be retired with a command rather than with rm"
---
# Work that is over goes away

The queue forgets; the store does not. A record, once written, stays on disk until somebody removes the file by hand, so a store that never removes anything grows for as long as the machine runs.
