---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/plugin-telegram": minor
"@amykit/plugin-slack": minor
---

**amy answers in the chat.**

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
