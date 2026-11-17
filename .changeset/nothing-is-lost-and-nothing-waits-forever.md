---
"@amykit/core": patch
"@amykit/cli": patch
"@amykit/plugin-slack": patch
"@amykit/plugin-linear": patch
"@amykit/plugin-telegram": patch
"@amykit/plugin-agent-relay": patch
"@amykit/plugin-file-store": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/workflow-errand": patch
---

**Nothing a process writes is lost to another, and no call waits forever.**

`amy run` now discovers before it ticks, through the same pass `amy tick` and the
daemon use, so a ticket sitting in the world is picked up on the first pass. One
transport in core gives every request a deadline and counts the body as it
arrives; Slack, Linear, Telegram and the models.dev refresh go through it. One
atomic write stages under a name only its writer holds, and notes, tasks and
records use it: two writers at one instant both survive, and `amy look` changes
a record under its own lock instead of overwriting the engine's move. The
Telegram bot takes core's lock, so a stale one is buried through a tombstone
rather than renamed aside by two processes at once. `config explain`, `workflow
check` and `workflow export` build their resolver with the profile they act for,
so a fork is what they read. Three repo-local rules keep each class out: a bare
`fetch`, a hand-built `.tmp` name and a resolver without its profile.
