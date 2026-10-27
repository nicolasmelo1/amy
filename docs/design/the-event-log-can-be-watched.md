# The event log can be watched

Delivered. The record of this decision is this document; what proves it is
the `the-event-log-can-be-watched` gate — the built plugin watched from one
process while another writes it — and the unit suites of the plugin and the
core. The plan that came before kept the argument below; what it promised is
the acceptance criteria at the end.

Everything amy does is a line in the event log, and nothing could be told
when one was written. `EventLog` had `append` and `read(since)`
(`packages/core/src/ports/EventLog.ts`), and the loop that appends runs in its
own process (`amy daemon`, `packages/cli/src/index.ts`). A reader in another
process — `amy status`, a dashboard, the window planned beside this — could
only ask again, and decide how often by guessing.

Every state change already writes a line: `work.advanced`, `work.waiting`,
`action.*`, `agent.run`. The log is the one place that knows something changed,
so it is the place to ask, rather than a second notification channel that
would have to agree with it.

## What changed

An optional method on the port:

```ts
watch?(since: Date, onEvent: (event: Event) => void): () => void;
```

It delivers every event at or after `since`, oldest first, then every event
appended afterwards by any process, until the returned function is called.

`plugin-file-log` implements it by following every day file from a byte
offset: a line is delivered only once its newline is on disk, so a line
half-written by the daemon is never read half, and only the bytes past the
offset are read, so a long day costs nothing to follow. It watches the
directory rather than the day's file, which is how a new day's file is picked
up without the caller resubscribing, and drains on a half-second timer too,
for filesystems that drop change events.

A reader of a log without `watch` goes through `watchEvents` in the core,
which falls back to `read(since)` on an interval and calls `onPolling` once,
so the caller can say so — the core words nothing a person reads. The poll
keeps a cursor at the last instant it delivered and remembers the lines it
delivered at that instant, so two events stamped the same millisecond are
both delivered and neither twice. The method is optional because a log is
allowed to be a sink nobody can watch.

It went through *no port method ships unproven*
([the design note](no-port-method-ships-unproven.md)) on arrival:
`plugins/file-log/tests/every-method-is-exercised.test.ts` walks the
adapter's methods, so the next one cannot arrive without a test either.

## What the gate drives, and what it does not

The writer in the gate's scenario is a second process appending through the
same built `FileEventLog` that `amy daemon` opens; it does not boot the
daemon itself, because the claim is about the log and the daemon adds an
install, a workflow and a tracker this claim never reaches. The one half line
is written by hand, because a crash mid-append is the thing a class never does
on purpose.

## Acceptance criteria

- [x] An event appended by another process reaches a watcher, once, in order
      (proof: test:plugins/file-log/tests/FileEventLog.test.ts)
- [x] A line without its newline yet is not delivered until it has one
      (proof: test:plugins/file-log/tests/FileEventLog.test.ts)
- [x] A watch that spans midnight delivers the next day's events without
      resubscribing (proof: test:plugins/file-log/tests/FileEventLog.test.ts)
- [x] Calling the returned function stops delivery and releases the watch
      (proof: test:plugins/file-log/tests/FileEventLog.test.ts)
- [x] A reader of a log without `watch` still sees every event, by polling
      (proof: test:packages/core/tests/ports.test.ts)
- [x] `watch` arrives through the guardrail every adapter method goes through
      (proof: test:plugins/file-log/tests/every-method-is-exercised.test.ts)
- [x] The writer the gate watches is a second process appending through the
      built plugin (proof: assertion:watch.the_writer_is_another_process)
- [x] A `work.advanced` that process wrote reaches the watcher within a second
      (proof: assertion:watch.a_work_advanced_arrives_within_a_second)
- [x] Each line it wrote is delivered once, in the order it was written
      (proof: assertion:watch.each_line_once_in_order)
- [x] A line half-written for over a second is held back until it is whole
      (proof: assertion:watch.a_partial_line_is_never_delivered)
- [x] The next day's file is followed across midnight without resubscribing
      (proof: assertion:watch.the_next_day_is_followed_without_resubscribing)
- [x] Nothing written after the watch is stopped is delivered
      (proof: assertion:watch.stopping_ends_delivery)

**Exit condition:** a process watching the log sees a `work.advanced` the
daemon wrote within a second of it being written, across a day boundary, and
never sees a partial line.
