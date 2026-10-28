---
"@amykit/core": minor
"@amykit/plugin-file-log": minor
---

**The event log can be watched, from any process.**

Everything amy does is a line in the event log, and a reader in another
process — `amy status`, a dashboard, the window planned next — could only read
it again and guess how often. The log is the one place that knows something
changed, so it is now the place to ask.

- `EventLog` gains an optional `watch(since, onEvent)`: every event at or
  after `since`, oldest first, then every event any process appends, until the
  returned function is called. Optional because a log may be a sink nobody
  can watch.
- `watchEvents(log, since, onEvent, { everyMs, onPolling })` in the core
  watches any log: through its own `watch`, or by polling `read` when it has
  none, calling `onPolling` once so the caller can say so.
- `@amykit/plugin-file-log` implements `watch` by following each day file from
  a byte offset. A line is delivered only once its newline is on disk, so a
  line the daemon is halfway through writing is never read half, and a new
  day's file is followed without resubscribing.
