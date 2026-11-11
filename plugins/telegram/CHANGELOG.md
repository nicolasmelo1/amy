# @amykit/plugin-telegram

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
