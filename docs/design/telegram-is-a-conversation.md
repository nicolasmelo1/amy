---
base: cde9855a078395b11605901e5d92dc0ac0ad51a1
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Conversation.ts", said: "the Conversation port is three methods — open a work item's thread, post into it, read its replies — with one adapter, Slack" }
  - { id: S2, kind: code, ref: "plugins/notify-hermes/src/", said: "notify-hermes delivers to Telegram only outward: a notification is not a question, and no answer is read back into its work" }
  - { id: S3, kind: decision, said: "@amykit/plugin-telegram implements Conversation against the Bot API" }
  - { id: S4, kind: decision, said: "a thread is a topic in the operator's private chat with the bot: open(workId, title) creates one with createForumTopic, first time only, kept on disk by work id so a restart reopens it. Replaces the forum supergroup, 2026-11-03" }
  - { id: S5, kind: reference, ref: "https://core.telegram.org/bots/api-changelog", said: "Bot API 9.3 gave private chats with a bot forum topic mode (User.has_topics_enabled, message_thread_id in private chats) and 9.4 let the bot create them with createForumTopic; the break after 10.0 (tdlib/telegram-bot-api#847) was fixed the day it was reported" }
  - { id: S6, kind: decision, said: "amy doctor refuses, by name, a bot whose topic mode is off (getMe has_topics_enabled) and an operator who never started a chat with it (getChat answers no private chat)" }
  - { id: S7, kind: decision, said: "only the operator answers: a reply is a topic message from the one configured user id; anyone else is ignored, and a message outside every topic answers nothing" }
  - { id: S8, kind: decision, said: "replies(thread, since) reads getUpdates from a persisted offset, files every message under its topic, returns those after since; a document or photo is downloaded, like Slack's, up to a size limit" }
  - { id: S9, kind: decision, said: "Telegram allows one getUpdates consumer per token, a second gets 409 Conflict; a token another program polls cannot be shared, amy doctor says so from the 409; the plugin wants its own bot" }
  - { id: S10, kind: decision, said: "the token is a secret read from amy's environment like every credential; nothing the plugin writes to disk contains it" }
  - { id: S11, kind: decision, said: "the Bot API is carried as a contract, like GitHub's REST description: recorded responses the adapter reads, served by a stand-in in the scenario, negative paths half of it" }
touches:
  - plugins/telegram/**
  - .software-factory/evidence/plugin-telegram*
  - .software-factory/policy.yaml
  - scripts/contracts.ts
  - scripts/bot-api-contract.ts
  - packages/test-fixtures/**
  - plugins/slack/tests/**
  - packages/cli/src/paths.ts
  - packages/cli/src/slices.ts
  - packages/cli/tests/project.test.ts
  - tsconfig.json
  - tsconfig.tests.json
untouched:
  - packages/core/src/**
  - packages/workflow-ticket-to-qa/src/**
  - plugins/slack/src/**
criteria:
  - { id: A1, statement: "open() creates one topic in the operator's private chat for a work item and returns the same one after a restart", proof: "test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S3, S4, S5, S11], done: true }
  - { id: A2, statement: "a reply from the operator in the topic is returned by replies(); a reply from anyone else, or outside the topic, is not", proof: "test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S7, S11], done: true }
  - { id: A3, statement: "a restart between a question and its answer loses neither: the answer is read once, by the right work item", proof: "assertion:telegram.the_answer_moves_its_own_ticket_and_no_other", sources: [S4, S8], done: true }
  - { id: A4, statement: "a file in a reply arrives as a readable local path, and one past the size limit is named instead", proof: "test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S8], done: true }
  - { id: A5, statement: "amy doctor refuses a bot with topic mode off, an operator with no chat with the bot, and a token answering 409 Conflict, each by name", proof: "test:plugins/telegram/tests/doctor.test.ts", sources: [S6, S9], done: true }
  - { id: A6, statement: "the token appears in no file the plugin writes", proof: "assertion:telegram.the_token_is_in_no_file_amy_wrote", sources: [S10], done: true }
  - { id: A7, statement: "ticket-to-qa with this conversation mounted asks, is restarted, is answered in Telegram and resumes the right work item", proof: "assertion:telegram.a_question_reaches_its_own_topic", sources: [S1, S2, S3], done: true }
failures:
  - { step: amy doctor, when: "the bot's topic mode is off, the operator never started a chat with it, or getUpdates answers 409 Conflict", goes_to: "refused by name" }
  - { step: replies, when: "a file exceeds the size limit", goes_to: "named instead of downloaded" }
cut:
  - "a forum supergroup: the private chat is the one shape"
  - "sharing a bot token another program already polls"
crosses:
  - { mechanism: profiles-and-state, answer: works, proof: "test:plugins/telegram/tests/TelegramConversation.test.ts (a removed profile's replies and files go with its directory; a phase's topics are its own, test:packages/cli/tests/project.test.ts)" }
guarantee:
  - { holds: "an answer read off Telegram is on disk under its topic before Telegram is told it was read", not_against: "an answer left unread by any amy for the 24 hours Telegram keeps it" }
deviations:
  - "the token is TELEGRAM_BOT_TOKEN in amy's environment, read the way Linear's key is, rather than a reference in the config"
  - "a server setting, Telegram's by default, so a local Bot API server or the scenario's stand-in can answer"
  - "a reply is marked by a command at its start, /decide (or ✅) for the decision and /discuss (or 💬) for a turn, taken off its text; Telegram tells a bot of a reaction only when it asks for message_reaction updates, so a command is the mark, and an unmarked reply is read by the workflow's policy (sixth review)"
  - "replies are filed on disk under their topic before the update offset moves, once per bot and operator, so any profile reads them; one process at a time reads updates, by a lock renewed while it is held and released only by its holder (review)"
  - "a profile's topics are its own, and a project's phase is handed its own directory by the CLI, as Slack's threads are; switching bot or operator starts afresh (review)"
  - "an offset older than six days is not sent, since Telegram renumbers its updates after a week without any (review)"
  - "a message with no text, caption or file, such as a topic renamed, is no answer (review)"
  - "a topic whose creation lost its answer is not recovered: a bot cannot list a private chat's topics, so the next look opens another (review, declined)"
  - "replies and their files are kept under the profile that owns the topic, found through owners.json in the bot's shared directory, so removing a profile forgets them; the bot's directory keeps only the owners, the offset and the lock (second review)"
  - "correctness does not depend on one reader: every reply is a file of its own, created and never rewritten, under an inbox named for its profile directory's identity; every topic and owner is a file created once; the offset only moves forward; each is flushed with its directory before the offset confirms it. The hold on the bot is a renewed lease that saves work (a 409, a topic opened twice) and nothing else (fourth review)"
  - "an owner is kept relative to the bot's directory with the identity of the profile directory that opened the topic, published whole by a link; a moved state root still finds it, a profile made again at a removed one's path owns none of its topics, and an identity that cannot be read confirms nothing (third and fourth reviews)"
  - "a local Bot API server's file path is never said, since it may carry the token; the operator's id is read as Telegram spells it (fourth review)"
  - "the bot's updates are read once per bot, whoever the operator, and filed by chat and topic, so two operators of one bot never discard each other's answers; a reply is published once and keeps its first time; work ids too long for a file name are cut and finished with a digest (fifth review)"
  - "Telegram keeps an unconfirmed update for 24 hours, and amy reads updates only when a profile looks for replies: an answer given while no amy using this bot runs for a whole day is lost. amy says so here rather than running a receiver of its own (fifth review)"
  - "a reply that arrives before its topic's owner is recorded is kept under the bot's unowned/ while a topic is being opened in that chat, and adopted, in message order, when the owner is recorded or on any later open or look; what an abandoned opening kept is removed after a day, and nothing is kept for a chat nobody is opening a topic in; a damaged reply file is never deleted, the reply is filed beside it only when the canonical file does not parse; a work id is a lowercase digest as a file name; a profile removed while Telegram answers is not made again (sixth and seventh reviews)"
  - "a reply's instant is derived from the message alone: the end of its Telegram second, then a microsecond part from its message id, so any reader files it with the same instant and two replies in one second keep their order; the order is lost only for two replies in one second whose ids straddle a multiple of 999 (seventh review)"
  - "a reply numbered below the last message amy posted in its topic by the instant asked about was written before that message, whatever second Telegram stamped them both with, and is not read as answering it; amy keeps each posted message's id with the time it posted it (ninth review)"
  - "a profile's removal deletes a Slack or Telegram directory only if it mounts that adapter, and never one another profile's slice names or one holding it; a reader that finds no owner and no opening reads the owner again before it lets a reply go (seventh and eighth reviews)"
  - "the hold on the bot is taken over without fencing the generation it observed: two takers of one stale hold can both open a topic, and the topic map keeps one, the other orphaned. Declined in the sixth review, since no reply depends on the hold"
  - "a method's documented return alternatives are all derived, as editMessageText's Message or True (third review)"
  - "every exchange with the Bot API has a deadline covering its body, a local Bot API server's absolute file paths are read where they lie, and text is cut at a character, never inside one (second review)"
  - "a reply is placed at the end of the second Telegram stamps it with, and after the last one filed, so two replies in a second keep their order and neither falls before a question asked within it"
  - "the Bot API contract is derived from Telegram's reference page into types and methods (scripts/bot-api-contract.ts) and checked fresh in check:contracts, since Telegram publishes no schema; the stand-in is held to it on every call and answer"
  - "Slack's stand-ins are held the same way, to the OpenAPI description Slack serves; it predates message metadata and cursor pagination, so those are let through by method, each naming Slack's documentation"
  - "also touched: package.json's e2e list, the generated docs and locks, the GitHub REST description the contract update fetched, a changeset"
exit: "a work item's question reaches its own Telegram topic, the process restarts, the operator answers in that topic, and the same work item — and no other — reads the answer and moves on"
---
# Telegram is a conversation

amy can notify Telegram but not read an answer from it, so an operator who
lives in Telegram has to answer in Slack or not at all.
