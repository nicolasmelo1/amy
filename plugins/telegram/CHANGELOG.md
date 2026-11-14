# @amykit/plugin-telegram

## 0.8.0

### Minor Changes

- a41a17f: **A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.
  
  - **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
  - **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
  - **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
  - **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
  - **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
  - **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.

### Patch Changes

- Updated dependencies [a41a17f]
- Updated dependencies [9a9ac0a]
- Updated dependencies [3a8cc7a]
  - @amykit/core@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1

## 0.7.0

### Minor Changes

- c7cd07a: **amy answers in the chat.**
  
  A message in the Telegram private chat outside every topic, or a root message
  in the Slack channel, is answered there. A plain message is an ask: the
  harness runs read-only, under its own sandbox or not at all, and nothing it
  names runs. A message starting with `/action` lets that turn act on amy: the
  commands its answer names in a fenced `amy` block run as amy with arguments,
  never a shell, and one off the fixed list refuses the whole block. `/new`
  starts another conversation in a chat without threads, `/harness <name>`
  switches the harness mid-conversation, and every turn sends the conversation
  whole. A long turn's progress is one message edited in place. A conversation
  is not work: its agent runs are held to no budget ceiling and kept out of the
  ledger, unless `chat.budget: true` asks for them to be counted.
  
  `config apply` writes a new `config.yaml` from the chat, shown as a diff,
  only when it mounts in a child first. `restart` lets a new mount through only
  when it boots, and the new loop says its pid in the chat. A loop whose
  workflow does not mount still answers in the chat and names the failure.
  
  `amy start` now starts the loop under the machine's supervisor — launchd on
  macOS, systemd --user on Linux, Task Scheduler on Windows — which starts it
  again when it dies; `amy stop` removes it so nothing does. `--detached` keeps
  the old behaviour, which is also what a machine with no supervisor gets.
  `amy doctor` names the supervisor in use and refuses a Linux user with
  lingering off.
  
  The core exports the chat's pieces (`answerTheChat`, `addressed`,
  `ChatProgress`, `Transcripts`, `commandsIn`) and `Conversation` gains optional
  `threads`, `edit`, `chat`, `settle`, `say` and `revise`. Telegram takes
  `topics: false`, where works share the private chat and a reply reaches one by
  quoting amy's message for it or starting with its id.
- b266baf: Questions can carry closed answers through the conversation adapters, and ticket-to-qa records a selected answer beside its question.
- 305f77a: **A Telegram topic is a work item's thread.** `@amykit/plugin-telegram` is the `conversation` port over the Bot API: each piece of work gets its own topic in the operator's private chat with a bot (topics in private chats, Bot API 9.4), opened once and found again after a restart. Only the operator's replies in that topic are answers; anybody else's, and anything outside every topic, are ignored. Replies are filed on disk before Telegram's update offset moves, so no restart and no second process loses one. A file in a reply arrives as a local path, and one past the Bot API's 20 MB is named instead. The token is `TELEGRAM_BOT_TOKEN` in amy's environment and is written nowhere. `amy doctor` refuses, by name, a bot with topic mode off, an operator who never started a chat with it, and a token whose updates something else reads (409 Conflict).
  
  ```yaml
  extraPlugins:
    - "@amykit/plugin-telegram"
  plugins:
    "@amykit/plugin-telegram":
      operator: "123456789"   # your Telegram user id
  ```
  
  **Telegram's and Slack's contracts are vendored and kept fresh.** Telegram publishes its Bot API only as a reference page, so `npm run contracts:update` derives that page into its types and methods, and `check:contracts` fails when today's page derives to something else. Slack's served OpenAPI description joins GitHub's and Linear's. The test fixtures export `assertValidBotApiCall`, `assertValidBotApiResult`, `assertValidSlackCall` and `assertValidSlackAnswer`, and both plugins' stand-ins are held to them.

### Patch Changes

- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
- Updated dependencies [b761f29]
- Updated dependencies [3b540fa]
- Updated dependencies [cea9b94]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [4a55287]
- Updated dependencies [91f6caf]
- Updated dependencies [ac4faca]
- Updated dependencies [ebae48c]
- Updated dependencies [2b4deec]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [65ebf9f]
- Updated dependencies [8b21570]
- Updated dependencies [d85dacd]
- Updated dependencies [c7cd07a]
- Updated dependencies [bb67d1f]
- Updated dependencies [ec32d67]
- Updated dependencies [b266baf]
- Updated dependencies [f062bea]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
