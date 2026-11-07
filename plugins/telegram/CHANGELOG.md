# @amykit/plugin-telegram

## 0.7.0

### Minor Changes

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

- Updated dependencies [b761f29]
- Updated dependencies [3b540fa]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
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
- Updated dependencies [ec32d67]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
