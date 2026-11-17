---
base: 1198a210bcb3820babf2361bbd89bb3a5b15a4e4
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/index.ts", said: "amy run loops engine.tick() and never calls engine.discover(); amy tick and the daemon discover first, and the serial Worker's tick only claims from the queue" }
  - { id: S2, kind: reference, said: "probe 2026-11-15 at f804048e: the amy run loop over the real Worker with an empty queue and TICKET-1 found came back idle, expected [] to include TICKET-1" }
  - { id: S3, kind: code, ref: "plugins/slack/src/SlackApi.ts", symbol: "fetchTransport", said: "fetch with no signal and no deadline option; plugins/linear/src/HttpGraphQLClient.ts the same; Telegram's BotApi aborts at deadlineMs" }
  - { id: S4, kind: reference, said: "probe 2026-11-15: a local server that never answers or trickles a byte every 200 ms left Slack and Linear hanging past 3 s, 6 of 6; Telegram's deadlineMs aborted, 3 of 3" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", said: "config explain, workflow check and workflow export build pluginsRootResolver without the profile, which loadMountable passes so a profile's fork resolves first" }
  - { id: S6, kind: reference, said: "probe 2026-11-15: with a fork drawing FORK_ONLY and the published package PUBLISHED_ONLY, all three commands read the published one; the resolver built with the profile reads the fork" }
  - { id: S7, kind: code, ref: "plugins/file-store/src/FileStore.ts", symbol: "save", said: "every writer stages the record at the same ${file}.tmp before renaming it; amy look loads, strips gaveUp and saves the record outside any lock" }
  - { id: S8, kind: reference, said: "probe 2026-11-15: two processes saving one record, 161 of 200 rounds threw ENOENT and 10 loads read torn JSON" }
  - { id: S9, kind: code, ref: "plugins/telegram/src/TelegramConversation.ts", said: "the bot's lock is an mkdir lease judged stale by mtime and renamed aside blindly; core's takeLock already buries a stale lock through a tombstone and re-checks it" }
  - { id: S10, kind: reference, said: "probe 2026-11-15: 8 processes on an hour-old lock, two holders at once in 20 of 100 rounds, and one claim threw ENOENT" }
  - { id: S11, kind: code, ref: "examples/workflow-note-to-plan/src/note-file.ts", said: "a note's id is a millisecond stamp checked free with existsSync, then written without wx; examples/workflow-errand/src/task-file.ts the same for a task" }
  - { id: S12, kind: reference, said: "probe 2026-11-15: two processes at one instant lost a note in 193 of 200 rounds and a task in 184 of 200, silently" }
  - { id: S13, kind: decision, said: "every fix is proven by a property whose falsifier, written in the property file, plants the defect the probe measured; L5.EVERY_PROPERTY_HAS_A_FALSIFIER runs it both ways. Decided 2026-11-15" }
  - { id: S14, kind: decision, said: "each class gets a rule so it cannot return: a request without a deadline, a temp name made by hand, a plugin resolver built without its profile, each with its mutation fixture. Decided 2026-11-15" }
  - { id: S15, kind: decision, said: "the gate is proven on the built artifacts in separate processes, never in-process interleavings, because the defects are between processes. Decided 2026-11-15" }
touches:
  - packages/cli/src/index.ts
  - packages/cli/src/loader.ts
  - packages/cli/src/pass.ts
  - packages/cli/src/setup.ts
  - packages/cli/tests/a-pass-discovers.property.test.ts
  - packages/cli/tests/a-fork-is-what-is-read.property.test.ts
  - packages/cli/tests/models.test.ts
  - packages/core/src/http.ts
  - packages/core/src/atomic-file.ts
  - packages/core/src/index.ts
  - packages/core/src/ports/Store.ts
  - packages/core/tests/http.property.test.ts
  - packages/core/tests/atomic-file.property.test.ts
  - plugins/slack/src/SlackApi.ts
  - plugins/slack/tests/fetchTransport.test.ts
  - plugins/linear/src/HttpGraphQLClient.ts
  - plugins/linear/tests/HttpGraphQLClient.test.ts
  - plugins/telegram/src/BotApi.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/file-store/src/FileStore.ts
  - plugins/file-store/tests/FileStore.property.test.ts
  - plugins/telegram/src/TelegramConversation.ts
  - plugins/telegram/tests/bot-lock.property.test.ts
  - examples/workflow-note-to-plan/src/note-file.ts
  - examples/workflow-note-to-plan/tests/note-file.property.test.ts
  - examples/workflow-errand/src/task-file.ts
  - examples/workflow-errand/tests/task-file.property.test.ts
  - .software-factory/policy.yaml
  - .software-factory/rules/a-request-has-a-deadline.yaml
  - .software-factory/rules/a-file-is-replaced-one-way.yaml
  - .software-factory/rules/a-resolver-knows-its-profile.yaml
  - .software-factory/evidence/nothing-is-lost-scenario.sh
  - .software-factory/evidence/nothing-is-lost/drive.ts
  - registry/cli.json
  - registry/core.json
  - registry/plugin-slack.json
  - registry/plugin-linear.json
  - registry/plugin-agent-relay.json
  - registry/plugin-file-store.json
  - registry/plugin-telegram.json
  - docs/rules.md
  - docs/development/the-factory.md
  - docs/development/the-gate.md
criteria:
  - { id: A1, statement: "for any queue state and any tickets the runtime finds, one pass of amy run, amy tick or the daemon, the same function, claims every ticket found", proof: "deferred:property:packages/cli/tests/a-pass-discovers.property.test.ts#a_pass_that_skips_discover", sources: [S1, S2, S13] }
  - { id: A2, statement: "for any server that stalls before headers or trickles after any number of bytes, a Slack, Linear, Telegram or models.dev call settles by its deadline, through the one transport in core", proof: "deferred:property:packages/core/tests/http.property.test.ts#a_fetch_without_a_signal", sources: [S3, S4, S13] }
  - { id: A3, statement: "a fetch( under packages, plugins or examples src outside packages/core/src/http.ts fails the build, naming the file", proof: "deferred:test:plugins/slack/tests/fetchTransport.test.ts", sources: [S3, S14] }
  - { id: A4, statement: "for config explain, workflow check and workflow export and any profile with a fork, the fork is what is read; every resolver comes from one function taking the profile", proof: "deferred:property:packages/cli/tests/a-fork-is-what-is-read.property.test.ts#a_resolver_without_its_profile", sources: [S5, S6, S13] }
  - { id: A5, statement: "pluginsRootResolver( called anywhere under packages/cli/src but that function fails the build", proof: "deferred:test:packages/cli/tests/a-fork-is-what-is-read.property.test.ts", sources: [S5, S14] }
  - { id: A6, statement: "for any number of processes writing one file through core's atomic write, none throws, no read is torn and the file ends as one whole write", proof: "deferred:property:packages/core/tests/atomic-file.property.test.ts#one_temp_name_for_every_writer", sources: [S7, S8, S13] }
  - { id: A7, statement: "for any interleaving of the engine saving a record and amy look clearing gaveUp, no state move is lost: look updates the record through the store under its lock", proof: "deferred:property:plugins/file-store/tests/FileStore.property.test.ts#look_loads_then_saves", sources: [S7, S8, S13] }
  - { id: A8, statement: "a temp name built by hand, a template ending in .tmp, under packages, plugins or examples src outside core's atomic write fails the build; today's others are frozen by name with a review_by", proof: "deferred:test:packages/core/tests/atomic-file.property.test.ts", sources: [S7, S14] }
  - { id: A9, statement: "for any number of processes and any stale lock, the Telegram bot is held by at most one at a time and no claim throws, through core's takeLock", proof: "deferred:property:plugins/telegram/tests/bot-lock.property.test.ts#a_stale_lock_renamed_blindly", sources: [S9, S10, S13] }
  - { id: A10, statement: "for any number of processes writing a note at one instant, every note exists with its own content and each enqueued id names it", proof: "deferred:property:examples/workflow-note-to-plan/tests/note-file.property.test.ts#a_note_written_over_another", sources: [S11, S12, S13] }
  - { id: A11, statement: "the same holds for errand tasks", proof: "deferred:property:examples/workflow-errand/tests/task-file.property.test.ts#a_task_written_over_another", sources: [S11, S12, S13] }
  - { id: A12, statement: "the built amy, in separate processes, keeps two notes and tasks of one instant, loses no move to a look, holds one Telegram bot after a stale lock, ends a stalled call, and amy run picks up a found ticket", proof: "deferred:assertion:lost.two_notes_at_one_instant_are_two", sources: [S2, S4, S8, S10, S12, S15] }
crosses:
  - { mechanism: engines, answer: works, proof: "deferred:A1" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A7" }
  - { mechanism: process-locks, answer: works, proof: "deferred:A9" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A4" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A4" }
  - { mechanism: agent-replies, answer: n/a, why: "only the models.dev price fetch in agent-relay moves to core's transport; no agent reply is read differently" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A2" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A2" }
guarantee:
  - { holds: "each defect the 2026-11-15 probes measured is reproduced by its falsifier and refused by its property", not_against: "a defect between processes the property's generator never schedules; the gate's scenario runs the built amy against that" }
  - { holds: "no HTTP call amy makes waits past its deadline", not_against: "a DNS lookup the platform blocks on before fetch is called" }
  - { holds: "a note, a task or a record move one process writes is not lost to another", not_against: "a person deleting the state directory while amy runs" }
failures:
  - { step: http, when: "a call passes its deadline", goes_to: "the call fails naming the host and the deadline, and the loop goes on to its next pass" }
  - { step: note, when: "the id is taken by another writer", goes_to: "the next free id, created exclusively, never the same file" }
cut:
  - "plan the-command-line-holds-no-rule moves these commands into services later; this fixes them where they are"
  - "the low findings of 2026-11-15: every-claim-and-path-agrees"
exit: "the gate nothing-is-lost is green on the built amy, every property here fails with its falsifier planted, and the three rules fire on their mutation fixtures"
---
# Nothing is lost and nothing waits forever

`amy run` ignores work that sits in the tracker. Slack and Linear wait forever
on a stalled server. Three commands read the published package, not the fork.
Concurrent writers lose records, notes and tasks, and two processes can hold
the Telegram lock at once. Each fix is proven by a falsifier that replants the
measured defect.
