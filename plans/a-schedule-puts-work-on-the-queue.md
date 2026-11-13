---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: decision, said: "a cron only puts work on the queue; almost every harness has one, and a state machine should be started by one too. Decided 2026-11-12" }
  - { id: S2, kind: decision, said: "a schedule fires only while the machine and its loop run; a firing missed while it slept runs once on wake or is skipped, as the plugin's own block in ~/.amy/config.yaml says. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "a schedule is an event source and enters amy through the events plans. Decided 2026-11-12" }
  - { id: S4, kind: code, ref: "examples/workflow-errand/src/plugin.ts", symbol: "captureTask", said: "errand.capture-task writes a task and puts it on the queue, declaring writes: [queue]; amy btw is its command" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", symbol: "runLoop", said: "each turn of a profile's loop links the harnesses' skills, reads the chat, runs discovery, then makes one tick; nothing else is asked each turn" }
  - { id: S6, kind: code, ref: "packages/core/events.json", said: "the event log takes only the kinds this contract lists, each with the fields it requires" }
  - { id: S7, kind: reference, ref: "plans/a-workflow-starts-on-an-event.md", said: "an event named on a workflow's [*] edge starts one record, keyed by the workflow's key" }
  - { id: S8, kind: reference, ref: "https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html", said: "a launchd calendar job missed while the Mac sleeps runs when it wakes; one missed while it is off waits for its next time" }
  - { id: S9, kind: reference, ref: "https://github.com/Hexagon/croner", said: "MIT, zero dependencies, a timezone option, previousRuns; under Vixie-cron DST rules a repeated fixed time runs once and a skipped one at the first valid time after" }
  - { id: S10, kind: decision, said: "a job names an operation that writes only the queue, with its input, so a firing does what that operation's command does; mount refuses any other. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "each job's last firing is kept under the profile's state, so no restart fires one twice; once coalesces every firing missed in one gap into one. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "a firing writes schedule.fired and a skipped one schedule.skipped, naming the job and the time it was due; schedule.fired is published, so a [*] edge may name it. Proposed 2026-11-12" }
  - { id: S13, kind: decision, said: "missed defaults to once, as launchd does, and timezone to the machine's own. Proposed 2026-11-12" }
touches:
  - plugins/schedule/package.json
  - plugins/schedule/tsconfig.json
  - plugins/schedule/README.md
  - plugins/schedule/src/index.ts
  - plugins/schedule/src/plugin.ts
  - plugins/schedule/src/config.ts
  - plugins/schedule/src/Schedules.ts
  - plugins/schedule/tests/Schedules.test.ts
  - plugins/schedule/tests/schedules.property.test.ts
  - plugins/schedule/tests/plugin.test.ts
  - packages/core/events.json
  - packages/core/tests/event-contract.test.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/schedules.test.ts
  - registry/plugin-schedule.json
  - docs/reference/plugins.md
  - docs/concepts/events.md
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - package-lock.json
  - .software-factory/policy.yaml
  - .software-factory/evidence/schedule-scenario.sh
criteria:
  - { id: A1, statement: "a job due at 09:00 puts one item on its profile's queue at the first loop turn at or after 09:00, by calling its operation with its input", proof: "deferred:test:plugins/schedule/tests/Schedules.test.ts", sources: [S1, S4, S5, S10] }
  - { id: A2, statement: "for any wake times and any cron, no job fires twice for one due time, across restarts, and nothing fires before it is due", proof: "deferred:property:plugins/schedule/tests/schedules.property.test.ts#refires_after_restart", sources: [S2, S11] }
  - { id: A3, statement: "for any gap the loop was down, missed once fires exactly one catch-up for it and missed skip fires none, writing schedule.skipped per due time", proof: "deferred:property:plugins/schedule/tests/schedules.property.test.ts#once_fires_every_missed_time", sources: [S2, S8, S11, S13] }
  - { id: A4, statement: "in a timezone with DST, a fixed-time job fires once on the repeated hour and once after the skipped one", proof: "deferred:property:plugins/schedule/tests/schedules.property.test.ts#dst_fires_twice", sources: [S9, S13] }
  - { id: A5, statement: "a job naming an operation that is not mounted, or one that writes anything besides the queue, is refused at mount naming the job and the operation", proof: "deferred:test:plugins/schedule/tests/plugin.test.ts", sources: [S10] }
  - { id: A6, statement: "an unreadable cron, an unknown timezone or a missed value other than once or skip is refused at mount naming the job and the setting", proof: "deferred:test:plugins/schedule/tests/plugin.test.ts", sources: [S2, S13] }
  - { id: A7, statement: "every firing writes schedule.fired and every skipped due time schedule.skipped, both accepted by the event contract", proof: "deferred:test:packages/core/tests/event-contract.test.ts", sources: [S3, S6, S12] }
  - { id: A8, statement: "a profile's loop asks its mounted schedules each turn, before discovery, and a profile mounting none behaves as before", proof: "deferred:test:packages/cli/tests/schedules.test.ts", sources: [S5] }
  - { id: A9, statement: "the built plugin, driven by a fake clock in another process, fires an errand job once, coalesces a slept gap under once and skips it under skip", proof: "assertion:schedule.a_firing_puts_work_on_the_queue", sources: [S1, S2, S7] }
crosses:
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A1; a firing enqueues through the operation's own write, never the queue directly" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:test:packages/core/tests/event-contract.test.ts" }
guarantee:
  - { holds: "a schedule fires each due time at most once, and only while its profile's loop runs", not_against: "a clock moved backwards by hand, which may fire a time again" }
  - { holds: "a firing only puts work on the queue, through an operation that writes nothing else", not_against: "what the work it queued then does once a workflow picks it up" }
  - { holds: "a firing is due to the minute and runs within one loop turn", not_against: "a loop turn held by a long agent run, which delays the firing until it ends" }
failures:
  - { step: fire, when: "the operation refuses its input", goes_to: "schedule.fired carries the refusal; the job is not retried until its next due time" }
  - { step: fire, when: "the state file is unreadable", goes_to: "amy doctor names it; nothing fires until it is fixed, rather than firing twice" }
cut:
  - "firing while the loop is down, through launchd or systemd: refused (S2)"
  - "a job that sends work to another amy: another amy puts work on this one's queue"
  - "a schedule starting a workflow on schedule.fired before a workflow starts on an event lands"
exit: "an errand profile with a Monday 09:00 job queues one task at 09:00; with the laptop asleep across it, missed once queues one on wake and missed skip queues none"
---
# A schedule puts work on the queue

amy finds work by polling or, with the events plans, by being told; nothing
starts work at a time. A schedule plugin names jobs in `~/.amy/config.yaml`,
each a cron and an operation that writes only the queue. While the loop runs,
each due time puts work on the queue exactly once.
