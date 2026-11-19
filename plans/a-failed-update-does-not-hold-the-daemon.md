---
base: 923afadbc96f70259f3a547c15d2fd4fbdaee170
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/index.ts", symbol: "scheduledUpdate", said: "the scheduled update spawns `amy update` with no --workflow and the parent's process.env, so the child reads the project's, the default profile's and the machine's .env only" }
  - { id: S2, kind: code, ref: "packages/cli/src/index.ts", symbol: "assembleProfiles", said: "the update's boot check assembles every configured profile inside that one process, so a profile whose key lives only in its own profiles/<name>/.env mounts without it" }
  - { id: S3, kind: code, ref: "plugins/telegram/src/plugin.ts", said: "the Telegram plugin refuses its mount when TELEGRAM_BOT_TOKEN is not in process.env" }
  - { id: S4, kind: code, ref: "packages/cli/src/auto-update.ts", symbol: "settleDaemonUpdate", said: "a non-zero update makes the claim due again (retryDaemonUpdate) and returns false" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", symbol: "settlePendingDaemonUpdate", said: "start and daemon settle the due marker of every profile and throw when one does not settle, so one profile's failed update refuses every profile's start, every time" }
  - { id: S6, kind: code, ref: "packages/cli/src/index.ts", symbol: "mount-check", said: "a hidden command already assembles one profile (forks prepared, schedule and chat problems refused) and exits 1 naming the profile's problems" }
  - { id: S7, kind: code, ref: "packages/cli/src/env.ts", symbol: "environmentFor", said: "builds one profile's environment: drops keys another profile's file set, then reads project, profile and machine .env" }
  - { id: S8, kind: code, ref: "packages/cli/src/index.ts", symbol: "moveEverything", said: "a refused boot check rolls every move back and returns 1; a rollback that fails is only printed, and also returns 1" }
  - { id: S9, kind: ticket, said: "2026-11-17: personal failed the boot check without its Telegram token; the daemon stayed down until the marker was deleted by hand. Reproduced at 923afadb: three starts, settled=false, marker kept" }
  - { id: S10, kind: decision, said: "the boot check mounts each profile in a child of the new binary, `amy --workflow <name> mount-check`, given environmentFor(home, name): keys isolated and the version that mounts is the one just installed. Decided 2026-11-17" }
  - { id: S11, kind: decision, said: "a scheduled update that fails at a daemon's start is reported, its marker dropped, and the daemon starts on the version the rollback left; the next due update tries again. Decided 2026-11-17" }
touches:
  - packages/cli/src/index.ts
  - packages/cli/src/auto-update.ts
  - packages/cli/tests/auto-update.test.ts
  - packages/cli/tests/update.test.ts
criteria:
  - { id: A1, statement: "the update's boot check mounts each configured profile in its own child, `--workflow <name> mount-check`, whose environment is environmentFor(home, name); a key only in profiles/<name>/.env reaches that profile's mount and no other's", proof: "deferred:test:packages/cli/tests/update.test.ts", sources: [S1, S2, S3, S6, S7, S9, S10] }
  - { id: A2, statement: "a profile's child that exits non-zero fails the boot check with that profile's own lines, prefixed by its name, and the update rolls back as it does today", proof: "deferred:test:packages/cli/tests/update.test.ts", sources: [S6, S8, S10] }
  - { id: A3, statement: "when the scheduled update fails at start or daemon, the failure is printed, the due marker and its claim are removed, and the daemon starts; settleDaemonUpdate no longer leaves the update due for the next start", proof: "deferred:test:packages/cli/tests/auto-update.test.ts", sources: [S4, S5, S9, S11] }
  - { id: A4, statement: "an update whose rollback failed exits with a distinct, named status, and a start that sees it keeps refusing, naming the rollback, because the machine is half-moved rather than on the version that booted", proof: "deferred:test:packages/cli/tests/auto-update.test.ts", sources: [S8, S11] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:A1" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A1" }
  - { mechanism: config, answer: works, proof: "deferred:A1" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2" }
  - { mechanism: process-locks, answer: works, proof: "deferred:A3" }
  - { mechanism: events-and-notifications, answer: n/a, why: "how a failure is printed does not change; nothing new is sent to a channel" }
guarantee:
  - { holds: "a profile's boot check sees that profile's own .env and no sibling's", not_against: "a key exported in the shell, which still beats every file for every profile" }
  - { holds: "a failed scheduled update never holds a daemon's start more than once", not_against: "a failed rollback, which leaves the machine half-moved and still refuses" }
failures:
  - { step: boot-check, when: "a profile's mount-check child cannot be spawned", goes_to: "that profile fails the check by name, and the update rolls back" }
  - { step: settle, when: "the scheduled update exits non-zero after a clean rollback", goes_to: "the failure is printed, the marker dropped, and the daemon starts on the rolled-back version" }
  - { step: settle, when: "the scheduled update reports a failed rollback", goes_to: "the start refuses, naming the rollback to restore by hand" }
exit: "update.test proves a profile-only key reaches only its own mount-check child, and auto-update.test proves a failed settle drops the marker and lets the start through while a failed rollback still refuses"
---

# A failed update does not hold the daemon

The update's boot check mounted every profile with the default profile's keys,
so a profile-only key failed it, and the due marker then refused every start.
Each profile is now checked in its own child with its own `.env`, and a failed
update after a clean rollback is reported and dropped; only a failed rollback
still refuses.
