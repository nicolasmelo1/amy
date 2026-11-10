---
title: The chat
description: Driving amy from Slack or Telegram, where it asks, offers the answers, takes yours, and tells you about the work.
group: Guides
order: 7
---

# The chat

Slack and Telegram are where you talk to amy. It asks you there, sends the
options as buttons or reactions, takes your answer, and answers your questions
about the work, while the loop keeps running on the machine. You never open a
terminal to answer it.

## Connecting a chat

Each chat is a [plugin](../concepts/glossary.md#plugin) that fills the
`conversation` [port](../concepts/glossary.md#port). Install the one you use
and give it your user id: only that person is answered, and everybody else's
messages are ignored.

```sh
amy add @amykit/plugin-telegram
```

```yaml
plugins:
  "@amykit/plugin-telegram":
    operator: "123456789"        # your Telegram user id; the token is TELEGRAM_BOT_TOKEN
  "@amykit/plugin-slack":
    channel: C0XXXXXXX           # a channel id, not a name
    token: env:SLACK_BOT_TOKEN
    operator: U0XXXXXXX
```

Each piece of work gets a thread of its own. In Slack it is a thread in the
channel ([a Slack thread per piece of work](../design/a-slack-thread-per-piece-of-work.md)).
In Telegram it is a topic in your private chat with the bot
([Telegram is a conversation](../design/telegram-is-a-conversation.md)). With
`topics: false`, every work shares the private chat, and a message reaches one
by quoting amy's message for it or by starting with its id, as in
`TBO-1: ship it`.

## amy asks, with the options

When a [workflow](../concepts/glossary.md#workflow) needs a person, it posts
the question in that work's thread
([an answer arrives where the question was asked](../design/an-answer-arrives-where-the-question-was-asked.md)).
A question with closed answers carries them, and the chat shows them as
controls:

| Kind | Telegram | Slack |
| :-- | :-- | :-- |
| approve or reject | buttons under the message | ✅ and ❌ on the message |
| pick one | a button per answer | a keycap per answer (1️⃣, 2️⃣…) |
| pick several | buttons that toggle a ✓, then Send | keycaps, then ✅ to send |

The first answer pressed is the answer, and amy says in the thread which one it
took. A pressed answer is always a decision. When a question has more answers
than the chat can show as controls, amy posts them as a numbered list and you
reply in words. Why:
[a question carries its answers](../design/a-question-carries-its-answers.md).

## amy takes the answer

A reply in a work's thread is one of:

- **a decision**: the work moves on, carrying the whole thread;
- **a turn in a discussion**: amy answers in the thread and the work waits.

You mark which with `/decide` or `/discuss` in Telegram (or ✅ and 💬), and in
Slack with a ✅ or 💬 reaction on your own reply. A reply you did not mark is
read by the workflow's `conversation` policy: `answer`, the default, takes it as
a decision; `discuss` takes it as a turn. A discussion runs the
[harness](../concepts/glossary.md#harness) read-only and moves nothing. Why:
[a question is not an answer](../design/a-question-is-not-an-answer.md).

## Ask amy about the work

A message that reaches no work is an ask: a new root message in the Slack
channel, or a message in Telegram's private chat outside every topic. amy
answers it in place. An ask writes nothing: the harness runs read-only under
its own sandbox, and one that cannot is refused, naming one that can.

- `/new` starts another conversation in a chat without threads; a thread is
  always one conversation.
- `/harness <name>` hands the conversation to another harness, with every turn
  so far.

Chat turns are not held to the agents' spending ceiling unless `chat.budget`
is on in `config.yaml`.

## Act with /action

A message that starts with `/action` may change amy. The answer names amy
commands from a fixed list (`status`, `look <id>`, `start`, `stop`, `restart`,
`add`, `remove`, `config apply`, `brief write`, and the like), and amy runs
them as amy, with arguments, never as a shell. A command off the list refuses
the whole turn by name. The same answer without `/action` runs nothing.

- `config apply` shows the change as a diff and writes `config.yaml` only if
  the new config mounts.
- `restart` boots the new mount in a child first; the running loop is replaced
  only when it boots, and the chat says the new pid.
- A loop whose workflow fails to mount still answers in the chat, says what
  failed, and takes `/action`.

Why it works this way:
[amy answers in the chat](../design/amy-answers-in-the-chat.md). The full list
of commands is in the [CLI reference](../reference/cli.md).
