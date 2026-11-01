---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Conversation.ts", said: "the Conversation port is three methods — open a work item's thread, post into it, read its replies — with one adapter, Slack" }
  - { id: S2, kind: code, ref: "plugins/notify-hermes/src/", said: "notify-hermes delivers to Telegram only outward: a notification is not a question, and no answer is read back into its work" }
  - { id: S3, kind: decision, said: "@amykit/plugin-telegram implements Conversation against the Bot API" }
  - { id: S4, kind: decision, said: "a thread is a forum topic: open(workId, title) creates one in a configured forum supergroup with createForumTopic, first time only; the topic id is kept in an on-disk thread map, like Slack's ts, so a restart reopens it" }
  - { id: S5, kind: reference, ref: "https://github.com/tdlib/telegram-bot-api/issues/847", said: "topics in a private chat with a bot were reported broken after Bot API 10.0; a supergroup is the documented shape" }
  - { id: S6, kind: decision, said: "amy doctor refuses, by name, a chat that is not a forum supergroup or a bot without can_manage_topics" }
  - { id: S7, kind: decision, said: "only the operator answers: a reply is a topic message from the one configured user id; anyone else is ignored, and a message outside every topic answers nothing" }
  - { id: S8, kind: decision, said: "replies(thread, since) reads getUpdates from a persisted offset, files every message under its topic, returns those after since; a document or photo is downloaded, like Slack's, up to a size limit" }
  - { id: S9, kind: decision, said: "Telegram allows one getUpdates consumer per token, a second gets 409 Conflict; a token another program polls cannot be shared, amy doctor says so from the 409; the plugin wants its own bot" }
  - { id: S10, kind: decision, said: "the token is a secret read from amy's environment like every credential; nothing the plugin writes to disk contains it" }
  - { id: S11, kind: decision, said: "the Bot API is carried as a contract, like GitHub's REST description: recorded responses the adapter reads, served by a stand-in in the scenario, negative paths half of it" }
touches:
  - plugins/telegram/**
criteria:
  - { id: A1, statement: "open() creates one topic for a work item and returns the same one after a restart", proof: "deferred:test against the stand-in Bot API", sources: [S3, S4, S5, S11] }
  - { id: A2, statement: "a reply from the operator in the topic is returned by replies(); a reply from anyone else, or outside the topic, is not", proof: "deferred:test against the stand-in Bot API", sources: [S7, S11] }
  - { id: A3, statement: "a restart between a question and its answer loses neither: the answer is read once, by the right work item", proof: "deferred:scenario through the installed executable", sources: [S4, S8] }
  - { id: A4, statement: "a file in a reply arrives as a readable local path, and one past the size limit is named instead", proof: "deferred:test against the stand-in Bot API", sources: [S8] }
  - { id: A5, statement: "amy doctor refuses a non-forum chat, a bot without topic rights, and a token answering 409 Conflict, each by name", proof: "deferred:test:plugins/telegram/tests/doctor.test.ts", sources: [S6, S9] }
  - { id: A6, statement: "the token appears in no file the plugin writes", proof: "deferred:test reading every file under the plugin's directory", sources: [S10] }
  - { id: A7, statement: "ticket-to-qa with this conversation mounted asks, is restarted, is answered in Telegram and resumes the right work item", proof: "deferred:scenario through the installed executable", sources: [S1, S2, S3] }
failures:
  - { step: amy doctor, when: "the chat is not a forum supergroup, the bot lacks can_manage_topics, or getUpdates answers 409 Conflict", goes_to: "refused by name" }
  - { step: replies, when: "a file exceeds the size limit", goes_to: "named instead of downloaded" }
cut:
  - "topics in a private chat with the bot"
  - "sharing a bot token another program already polls"
exit: "a work item's question reaches its own Telegram topic, the process restarts, the operator answers in that topic, and the same work item — and no other — reads the answer and moves on"
---
# Telegram is a conversation

amy can notify Telegram but not read an answer from it, so an operator who
lives in Telegram has to answer in Slack or not at all.
