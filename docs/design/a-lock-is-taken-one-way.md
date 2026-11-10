---
base: 056aab596f296d6f797a417ae3ea1d660bc53e4a
sources:
  - { id: S1, kind: friction, said: "2026-11-10: about twelve of #189's 76 review findings were races in two hand-written locks, the config apply lock in chat-action.ts and the message claims in chat/desk.ts" }
  - { id: S2, kind: code, ref: "plugins/prove/src/lease.ts", symbol: "acquire", said: "the proof's lease lock already names its owner, reclaims only a dead one, and was proven by processes racing on one stale lock" }
  - { id: S3, kind: code, ref: "packages/cli/src/daemon.ts", symbol: "claimDaemonBoundary", said: "opens the lock with wx and writes the pid after; a reader in between reads an empty file as pid 0, malformed, and removes a live lock" }
  - { id: S4, kind: code, ref: "packages/cli/src/chat-action.ts", symbol: "clearAbandoned", said: "a fourth lock with its own staged link, owner token and per-owner recovery guard, exported and tested on its own" }
  - { id: S5, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "claim", said: "a claim is a lease: renewed by touching it every quarter of ten minutes, taken over once older than that, under a .recovering file" }
  - { id: S6, kind: friction, said: "2026-11-10: seven places ask whether a process lives with process.kill(pid, 0): daemon.ts, chat-action.ts, auto-update.ts, index.ts twice, prove's lease.ts and slack's ThreadMap.ts" }
  - { id: S7, kind: decision, said: "the lock goes in the core, because the CLI and every plugin but ui-stub already import it; decided 2026-11-10" }
  - { id: S8, kind: reference, ref: "docs/concepts/ports.md", said: "something general graduates into the core on evidence, a second workflow that wants it, rather than a guess" }
  - { id: S9, kind: decision, said: "a lock an earlier version left (a pid line, a pid:token line, a bare token, a directory holding owner.json) is honored: old and new amy run side by side after an update; groomed 2026-11-10" }
  - { id: S10, kind: decision, said: "a dead owner's lock is taken over by linking it to a tombstone named for that owner, which only one process can create, never by reading and then removing; groomed 2026-11-10" }
  - { id: S11, kind: code, ref: "packages/cli/src/auto-update.ts", symbol: "takeDaemonUpdate", said: "an update is handed from due to claiming to claimed by renames, a queue of one rather than a lock" }
touches:
  - packages/core/src/process-lock.ts
  - packages/core/src/index.ts
  - packages/core/tests/process-lock.test.ts
  - packages/core/tests/process-lock.property.test.ts
  - packages/core/src/chat/desk.ts
  - packages/core/tests/chat/desk.test.ts
  - packages/cli/src/daemon.ts
  - packages/cli/tests/daemon.test.ts
  - packages/cli/src/chat-action.ts
  - packages/cli/tests/chat-action.test.ts
  - packages/cli/src/auto-update.ts
  - packages/cli/src/index.ts
  - plugins/prove/src/lease.ts
  - plugins/prove/tests/lease.test.ts
  - plugins/prove/tests/lease.property.test.ts
  - plugins/slack/src/ThreadMap.ts
  - docs/mechanisms.yaml
  - registry/core.json
  - registry/cli.json
  - registry/plugin-prove.json
  - registry/plugin-slack.json
untouched:
  - "packages/core/src/leases.ts: a branch lease has a holder's name and no process behind it to die"
criteria:
  - { id: A1, statement: "for any sequence of takes, releases, renewals, deaths and clock moves by any holders, no two hold one lock at once and a live, renewed holder's lock is never taken", proof: "property:packages/core/tests/process-lock.property.test.ts#a_lock_held_twice", sources: [S1, S7, S10], done: true }
  - { id: A2, statement: "six processes racing on a lock whose owner died: exactly one takes it, and the tombstone stops a second from removing the new owner's lock", proof: "test:packages/core/tests/process-lock.test.ts", sources: [S2, S10], done: true }
  - { id: A3, statement: "a lock is published whole: a reader never finds it empty or without its owner, so a lock being taken is never read as abandoned", proof: "test:packages/core/tests/process-lock.test.ts", sources: [S3], done: true }
  - { id: A4, statement: "a lock taken with a lease is taken over once unrenewed past it, whether its owner lives or not, and renewing keeps it", proof: "test:packages/core/tests/process-lock.test.ts", sources: [S5], done: true }
  - { id: A5, statement: "a pid line, a pid:token line, a bare token and a directory holding owner.json are each held while their owner lives or is fresh and taken over once dead or stale", proof: "test:packages/core/tests/process-lock.test.ts", sources: [S9], done: true }
  - { id: A6, statement: "the daemon boundary, the config apply lock, a chat message's claim and the proof's lease lock are each taken through the core lock, and their own tests pass through it", proof: "test:packages/cli/tests/chat-action.test.ts", sources: [S1, S3, S4, S5, S7], done: true }
  - { id: A7, statement: "no file under a package, plugin or example src/ but packages/core/src/process-lock.ts calls process.kill with a signal of 0", proof: "test:packages/core/tests/process-lock.test.ts", sources: [S6, S8, S11], done: true }
crosses:
  - { mechanism: profiles-and-state, answer: works, proof: "A6; daemon.ts keeps its pid file and lock path, and only how the lock is taken changes" }
  - { mechanism: install-and-update, answer: works, proof: "A5, A7; auto-update.ts asks the core whether a claim's owner lives and keeps its hand-off" }
  - { mechanism: events-and-notifications, answer: works, proof: "A7; ThreadMap.ts asks the core whether an owner lives and keeps its generations" }
  - { mechanism: process-locks, answer: works, proof: "A1, A2, A3" }
guarantee:
  - { holds: "one lock path is held by at most one live process at a time", not_against: "a pid reused by another process, which keeps a dead owner's lock until its lease, if any, runs out" }
  - { holds: "a dead owner's lock is taken over by exactly one process", not_against: "a recoverer stalled longer than a tombstone is kept, an hour" }
  - { holds: "a lock an earlier version left is honored", not_against: "a lock path an earlier version kept somewhere else" }
failures:
  - { step: taking, when: "the lock is held by a live owner", goes_to: "undefined, and the caller waits or refuses as it does today" }
  - { step: taking, when: "the owner is dead or its lease ran out", goes_to: "one process links it to that owner's tombstone and takes it; the others see the tombstone and wait" }
  - { step: releasing, when: "the lock is no longer this holder's", goes_to: "nothing is removed" }
  - { step: renewing, when: "the lock was taken over", goes_to: "renew answers false and the holder stops" }
cut:
  - "auto-update's due, claiming, claimed hand-off: a queue of one, not a lock; it only asks the core whether an owner lives (S11)"
  - "slack's ThreadMap generations: a log with owners, not a lock; it only asks the core whether an owner lives"
  - "branch leases in packages/core/src/leases.ts: held by a lane's name, with no process to die"
  - "a lock across machines: every lock here is a file on one machine's disk"
exit: "the daemon, config apply, chat claims and proof leases take one core lock; six processes racing on a dead lock leave one holder; one file asks whether a pid lives"
---
# A lock is taken one way

The hand-written locks become one in the core, held to a property and to
racing processes, and every other place that asks whether a process lives
asks the core.
