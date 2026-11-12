---
"@amykit/core": minor
"@amykit/workflow-testkit": minor
"@amykit/agent-kit": minor
"@amykit/plugin-claude": minor
"@amykit/plugin-prove": patch
"@amykit/plugin-notify-fanout": patch
"@amykit/plugin-slack": minor
"@amykit/plugin-telegram": minor
"@amykit/plugin-terminal-conversation": minor
"@amykit/plugin-file-worktree": patch
"@amykit/workflow-ticket-to-qa": patch
"@amykit/workflow-feature-grooming": patch
"@amykit/workflow-errand": patch
"@amykit/workflow-note-to-plan": patch
---

**A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.

- **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
- **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
- **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
- **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
- **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
- **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.
