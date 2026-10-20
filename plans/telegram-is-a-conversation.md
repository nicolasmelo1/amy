# Telegram is a conversation

The `Conversation` port (`packages/core/src/ports/Conversation.ts`) is three
methods — `open` a work item's thread, `post` into it, read its `replies` — and
one adapter, Slack. `notify-hermes` can already deliver to Telegram, but only
outward: a notification is not a question, and nothing reads the answer back
into the work it was about. An operator who lives in Telegram has to answer in
Slack or not at all.

## The shape

`@amykit/plugin-telegram` implements `Conversation` against the Bot API:

- **A thread is a forum topic.** `open(workId, title)` creates a topic in one
  configured forum supergroup with `createForumTopic`, the first time and only
  the first time; the topic id is kept in a thread map on disk, as the Slack
  adapter keeps its `ts`, so a restart opens the same topic.
- **A supergroup, not a private chat.** Topics in a private chat with a bot
  were reported broken after Bot API 10.0
  ([tdlib/telegram-bot-api#847](https://github.com/tdlib/telegram-bot-api/issues/847)),
  and a supergroup is the documented shape. `amy doctor` refuses a chat that is
  not a forum supergroup, or a bot without `can_manage_topics`, by name.
- **Only the operator answers.** A reply is a message in the topic from the one
  configured user id. Anyone else in the group is ignored, and a message outside
  every topic is never an answer to anything.
- **Replies are polled, and the offset is kept.** `replies(thread, since)` reads
  `getUpdates` from a persisted offset, files every message under its topic and
  returns the ones after `since`. A document or photo is downloaded, as the
  Slack adapter does, up to a size limit.
- **One bot, one reader.** Telegram allows one `getUpdates` consumer per token;
  a second gets `409 Conflict`. A token another program already polls — an
  assistant's bot, for one — cannot be shared, and `amy doctor` says so from the
  `409` rather than letting two programs steal each other's updates. The plugin
  wants a bot of its own.

The token is a secret and is read from amy's environment like every other
credential; nothing the plugin writes to disk contains it.

## The proof

The Bot API is a contract this repository can carry, the way it carries
GitHub's REST description: a recorded set of the responses the adapter reads,
served by a stand-in in the scenario, and the negative paths are half of it.

## Acceptance criteria

- [ ] `open()` creates one topic for a work item and returns the same one after
      a restart (proof: deferred:test against the stand-in Bot API)
- [ ] A reply from the operator in the topic is returned by `replies()`; a reply
      from anyone else, or outside the topic, is not
      (proof: deferred:test against the stand-in Bot API)
- [ ] A restart between a question and its answer loses neither: the answer is
      read once, by the right work item (proof: deferred:scenario through the installed executable)
- [ ] A file in a reply arrives as a readable local path, and one past the size
      limit is named instead (proof: deferred:test against the stand-in Bot API)
- [ ] `amy doctor` refuses a non-forum chat, a bot without topic rights, and a
      token answering `409 Conflict`, each by name
      (proof: deferred:test:plugins/telegram/tests/doctor.test.ts)
- [ ] The token appears in no file the plugin writes
      (proof: deferred:test reading every file under the plugin's directory)
- [ ] `ticket-to-qa` with this conversation mounted asks, is restarted, is
      answered in Telegram and resumes the right work item
      (proof: deferred:scenario through the installed executable)

**Exit condition:** a work item's question reaches its own Telegram topic, the
process restarts, the operator answers in that topic, and the same work item —
and no other — reads the answer and moves on.
