---
base: 923afadbc96f70259f3a547c15d2fd4fbdaee170
sources:
  - { id: S1, kind: code, ref: "plugins/slack/src/SlackApi.ts", symbol: "send", said: "a 429 sleeps the whole Retry-After, up to five times, so a day's wait becomes five days inside one call" }
  - { id: S2, kind: code, ref: "packages/cli/src/loader.ts", symbol: "pluginsRootResolver", said: "the profile is optional, so a resolver can be built for no profile and read the published package over a fork" }
  - { id: S3, kind: decision, said: "a lock is waited out for the lease it is judged by: 500 turns of 2 ms is a second beside a ten-second lease, and a save that gives up loses its move. Decided 2026-11-17" }
  - { id: S4, kind: decision, said: "a discovery deadline is one failed discovery: the pass ticks what the queue already holds, says which host it missed and for how long, and rethrows a failure that is not a deadline. Decided 2026-11-17" }
  - { id: S5, kind: decision, said: "no source stages a file under a name it built: core's one atomic write stages beside the target under a name only its writer holds. Decided 2026-11-17" }
  - { id: S6, kind: decision, said: "a gate drives the product it names, through that product's own build and the installed command, never the core piece underneath it. Decided 2026-11-17" }
  - { id: S7, kind: decision, said: "the request rule refuses every spelling of a bare fetch, globalThis, global and self included, not only the unqualified name. Decided 2026-11-17" }
touches:
  - .software-factory/evidence/nothing-is-lost/drive.ts
  - .software-factory/rules/a-request-has-a-deadline.yaml
  - packages/cli/src/harnesses.ts
  - packages/cli/src/index.ts
  - packages/cli/src/loader.ts
  - packages/cli/src/pass.ts
  - packages/cli/src/plugin-commands.ts
  - packages/cli/src/setup.ts
  - packages/cli/tests/a-fork-is-what-is-read.property.test.ts
  - packages/cli/tests/a-pass-outlives-a-deadline.test.ts
  - packages/cli/tests/add.test.ts
  - packages/cli/tests/fork.test.ts
  - packages/cli/tests/loader.test.ts
  - packages/cli/tests/one-resolver.test.ts
  - packages/cli/tests/profile-root.test.ts
  - packages/cli/tests/project.test.ts
  - packages/cli/tests/workflow-export.test.ts
  - packages/core/src/http.ts
  - packages/core/src/index.ts
  - packages/core/src/ports/Store.ts
  - packages/core/tests/one-way-to-stage-a-file.test.ts
  - plugins/file-brief-store/src/FileBriefStore.ts
  - plugins/file-store/src/FileStore.ts
  - plugins/file-store/tests/a-save-waits-its-turn.test.ts
  - plugins/prove/src/lease.ts
  - plugins/prove/src/proof.ts
  - plugins/slack/src/SlackApi.ts
  - plugins/slack/src/ThreadMap.ts
  - plugins/slack/tests/a-call-keeps-its-deadline.test.ts
  - plugins/telegram/src/TelegramConversation.ts
  - registry/cli.json
  - registry/core.json
  - registry/plugin-file-brief-store.json
  - registry/plugin-file-store.json
  - registry/plugin-prove.json
  - registry/plugin-slack.json
  - registry/plugin-telegram.json
  - scripts/tests/nothing-is-lost-gate.test.ts
  - scripts/tests/request-rule.test.ts
criteria:
  - { id: A1, statement: "a Slack call that is told to wait settles within the deadline it allowed itself, the waits counted against it, and never waits five Retry-After periods", proof: "deferred:test:plugins/slack/tests/a-call-keeps-its-deadline.test.ts", sources: [S1] }
  - { id: A2, statement: "a save beside a process that holds the record waits its turn for the lease the lock is judged by, and its move is the one kept", proof: "deferred:test:plugins/file-store/tests/a-save-waits-its-turn.test.ts", sources: [S3] }
  - { id: A3, statement: "the resolver is built in one place under packages/cli/src and cannot be built without the profile it acts for", proof: "deferred:test:packages/cli/tests/one-resolver.test.ts", sources: [S2] }
  - { id: A4, statement: "a pass whose discovery runs out of time still advances the work already queued, names the host and deadline it missed, and rethrows a failure that is not a deadline", proof: "deferred:test:packages/cli/tests/a-pass-outlives-a-deadline.test.ts", sources: [S4] }
  - { id: A5, statement: "no source under packages, plugins or examples stages a file under a .tmp name built by hand", proof: "deferred:test:packages/core/tests/one-way-to-stage-a-file.test.ts", sources: [S5] }
  - { id: A6, statement: "the nothing-is-lost gate holds the bot through the Telegram plugin's build, releases through the installed amy look, checks the release survives the engine's save, and ends a stalled Slack and Linear call", proof: "deferred:test:scripts/tests/nothing-is-lost-gate.test.ts", sources: [S6] }
  - { id: A7, statement: "the request rule flags globalThis.fetch, global.fetch and self.fetch as calls outside the one transport", proof: "deferred:test:scripts/tests/request-rule.test.ts", sources: [S7] }
crosses:
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A1" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A2" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A3" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A4" }
  - { mechanism: briefs, answer: works, proof: "deferred:A5" }
guarantee:
  - { holds: "nothing a call or a pass waits for outlives the deadline it declared", not_against: "a server that answers inside its deadline and a pass that has nothing queued" }
failures:
  - { step: discover, when: "the transport reaches its deadline", goes_to: "the pass ticks what the queue holds and says which host it missed" }
  - { step: save, when: "another process holds the record", goes_to: "the save waits up to the lock's lease, then takes its turn and writes" }
exit: "seven red tests go green without loosening any of them, and the gate scenario passes driving the plugin builds and the installed command"
---

# A wait fits inside its deadline

A server's Retry-After is a wish, not a budget: the waits a call spends count against the deadline it declared, and the call settles when the next one no longer fits. A discovery that runs out of time is one failed discovery, not a failed pass.

The resolver is built once, for a named profile. Every staged file goes through core's atomic write. The gate drives the products it names, through their own builds.
