# The event log can be watched

Everything amy does is a line in the event log, and nothing can be told when
one is written. `EventLog` has `append` and `read(since)`
(`packages/core/src/ports/EventLog.ts`), and the loop that appends runs in its
own process (`amy daemon`, `packages/cli/src/index.ts:616`). A reader in
another process — `amy status`, a dashboard, the window planned beside this —
can only ask again, and decide how often by guessing.

Every state change already writes a line: `work.advanced`, `work.waiting`,
`action.*`, `agent.run`. The log is the one place that knows something changed,
so it is the place to ask, rather than a second notification channel that
would have to agree with it.

## What changes

An optional method on the port:

```ts
watch(since: Date, onEvent: (event: Event) => void): () => void;
```

It delivers every event at or after `since`, oldest first, then every event
appended afterwards by any process, until the returned function is called.

`plugin-file-log` implements it by watching the day's file and reading from a
byte offset: a line is delivered only once its newline is on disk, so a line
half-written by the daemon is never read half. A new day's file is picked up
without the caller resubscribing.

A reader of a log without `watch` falls back to `read(since)` on an interval,
and says so once. The method is optional because a log is allowed to be a sink
nobody can watch.

It goes through *no port method ships unproven*
(`docs/design/no-port-method-ships-unproven.md`) on arrival.

## Acceptance criteria

- [ ] An event appended by another process reaches a watcher, once, in order
      (proof: deferred:test:plugins/file-log/tests/FileEventLog.test.ts)
- [ ] A line without its newline yet is not delivered until it has one
      (proof: deferred:test:plugins/file-log/tests/FileEventLog.test.ts)
- [ ] A watch that spans midnight delivers the next day's events without
      resubscribing (proof: deferred:test:plugins/file-log/tests/FileEventLog.test.ts)
- [ ] Calling the returned function stops delivery and releases the watch
      (proof: deferred:test:plugins/file-log/tests/FileEventLog.test.ts)
- [ ] A reader of a log without `watch` still sees every event, by polling
      (proof: deferred:test:packages/core/tests/ports.test.ts)

**Exit condition:** a process watching the log sees a `work.advanced` the
daemon wrote within a second of it being written, across a day boundary, and
never sees a partial line.
