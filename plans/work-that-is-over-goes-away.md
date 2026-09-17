# Work that is over goes away

The queue forgets. The store does not.

`FileQueue.prune(retentionDays, now)` drops finished items past their retention
(`plugins/file-queue/src/FileQueue.ts:107`), and `retentionDays` is a setting
the queue plugin declares. `plugin-file-store` declares a directory and nothing
else, and the `Store` port is three methods:

```ts
load(workId: string): R | null;
save(record: R): void;
all(): R[];
```

There is no `delete`. A record, once written, is on that disk until somebody
removes the file by hand.

## Half of this already works

`terminalStates` is a list — it is meant to be several, and `workflow-revv` has
two (`DONE` and `REVIEW_POSTED`). `Worker.discover` reads it and refuses to
re-enqueue work that reached one (`plugins/serial-engine/src/Worker.ts:109`).
So a finished record is not reprocessed, and no agent is spent on it. That part
is right and this plan does not touch it.

`amy status` no longer prints what has ended either: it counts it below the
table, and `--all` brings it back. That hides the record. It does not remove
it, and a store that never removes anything is still a store that grows for as
long as the machine runs.

What is missing is that the record never *leaves*.

## The trap in deleting

Deleting a record is not the same as retiring the work, and doing it while the
work can still be found is worse than doing nothing: `found()` offers the id
again, no record exists to be recognised as terminal, and the whole lifecycle
starts over from the beginning. The safeguard that stops rediscovery *is* the
terminal record.

So retiring cannot mean "remove the file" while the tracker still returns the
id. It has to mean "reach an end", and removal is what happens to an ended
record later, when nothing would rediscover it anyway.

This is also why the several terminal states need no ceremony. They differ in
what happened — handed to QA, descoped, review posted — and not at all in what
should become of the record. The log is where the difference is kept: it is
append-only, the budget is measured on it, and it outlives every record.

## What changes

- `Store` grows `delete(workId)`. It is the missing primitive and everything
  below needs it.
- `plugin-file-store` grows `retentionDays`, mirroring the queue's, and a
  `prune` that removes records in a terminal state older than it. The default
  matches the queue's so one number does not quietly mean two things.
- `amy forget <workId>` retires one piece of work by advancing it to a terminal
  state, not by deleting it — a tombstone that keeps refusing rediscovery.
  Deletion is retention's job. For work that can never reach an end on its own
  — a ticket somebody removed, a review whose pull request is gone — this is
  the only way out that does not restart it.

`amy forget` also drops that work's pending queue items, because a record that
has ended has nothing due.

## Acceptance criteria

- [ ] `Store.delete` removes one record and leaves the rest
      (proof: test:plugins/file-store/tests/FileStore.test.ts)
- [ ] A terminal record older than the retention is pruned
      (proof: test:plugins/file-store/tests/prune.test.ts)
- [ ] A record that is not terminal is never pruned, however old
      (proof: test:plugins/file-store/tests/prune.test.ts)
- [ ] `amy forget` on live work advances it to a terminal state, and the next
      `discover` does not enqueue it
      (proof: test:plugins/serial-engine/tests/Worker.discover.test.ts)
- [ ] `amy forget` drops that work's pending queue items
      (proof: test:packages/cli/tests/forget.test.ts)
- [ ] The event log still carries everything that happened to a record that
      has been pruned
      (proof: test:packages/cli/tests/forget.test.ts)

**Exit condition:** a record that ended leaves the disk on its own, and one
piece of work that will never finish on its own can be retired with a command
rather than with `rm`.
