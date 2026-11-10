---
base: 0af9e232513063af9a4502c29fca923c3a0899db
sources:
  - { id: S1, kind: friction, said: "2026-11-09: half the work with an agent is conversation. The person wants to groom, ask about projects and run amy from Slack and Telegram while the loop keeps working, never opening an agent CLI or a window" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Conversation.ts", said: "the port is one work's thread: open(workId), post, replies; there is no conversation that belongs to no work" }
  - { id: S3, kind: code, ref: "plugins/telegram/src/TelegramConversation.ts", said: "a message outside every topic of the private chat is dropped, so the chat itself answers nothing" }
  - { id: S4, kind: code, ref: "plugins/slack/src/SlackConversation.ts", said: "one thread per piece of work in one channel; a root message the operator posts there belongs to no work and is never read" }
  - { id: S5, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/gateway/session.py build_session_key, https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/gateway/session_lifecycle.py", said: "a conversation is keyed platform, chat and thread; a chat without threads is one conversation, replaced only by /new, never by time" }
  - { id: S6, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/gateway/run_turn_progress.py", said: "a turn's tool progress is one message edited in place, one line per message where the platform cannot edit" }
  - { id: S7, kind: reference, ref: "https://developers.secure.facebook.com/docs/whatsapp/api/webhooks/inbound", said: "WhatsApp has no threads; an inbound reply carries context.id, the wamid of the message it quotes" }
  - { id: S8, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "two conversations never confused: asking writes nothing; discussing with the work ends in a decision. That row is the window's half" }
  - { id: S9, kind: code, ref: "packages/core/src/ports/Harness.ts", said: "readOnly is enforced by the harness's own sandbox (claude plan mode, codex read-only) or the harness refuses the run, as hermes does" }
  - { id: S10, kind: decision, said: "a message that reaches no work and has no /action is an ask: it reads and answers and writes nothing, enforced rather than asked for. Decided 2026-11-09" }
  - { id: S11, kind: decision, said: "/action at a message's start is the green flag for that turn to act on amy: start or stop the loop, add or change a workflow, and the like. Decided 2026-11-09" }
  - { id: S12, kind: decision, said: "under /action too the harness runs read-only; its answer names amy commands from a fixed list and amy runs them as amy with arguments, never a shell. Proposed 2026-11-09" }
  - { id: S13, kind: reference, ref: "plans/the-command-line-holds-no-rule.md", said: "every built-in becomes an operation of @amykit/services; this row ships first, so its list is the command line's, and becomes those operations when that row lands" }
  - { id: S14, kind: decision, said: "a thread is one conversation (a root message's Slack thread, a Telegram topic); a chat without threads is one until /new. Proposed 2026-11-09" }
  - { id: S15, kind: decision, said: "in a chat without threads, a reply quoting amy's message for a work, or a message starting with its id, reaches that work; anything else is an ask. Proposed 2026-11-09" }
  - { id: S16, kind: decision, said: "an adapter declares threads?: true and edit?: true as it declares asks?: true; the core routes by them and an adapter never guesses. Proposed 2026-11-09" }
  - { id: S17, kind: decision, said: "grooming from the chat runs the mounted workflow's grooming: what it reads and where it writes (Linear, Jira, a brief file) is that workflow's declaration, never this row's. Decided 2026-11-09" }
  - { id: S18, kind: reference, ref: "docs/design/a-workflow-that-claims-no-writes-cannot-reach-one.md", said: "an unclaimed tracker or code-host writer rejects before the adapter is called" }
  - { id: S19, kind: reference, ref: "docs/design/a-question-is-not-an-answer.md", said: "a work thread's reply is a discussion turn or a decision, marked by /decide and /discuss or read under policy.conversation" }
  - { id: S20, kind: decision, said: "the daemon reads the chat all the time, not only the threads of waiting work; a message arriving mid-turn waits for the next turn. Proposed 2026-11-09" }
  - { id: S21, kind: decision, said: "a conversation is one file under the profile's state directory and each turn sends it whole, so /harness switches harness mid-conversation. Proposed 2026-11-09" }
  - { id: S23, kind: decision, said: "this row ships first, before 0.7: amy is driven from the chat from then on, the person far from the machine. Decided 2026-11-09" }
  - { id: S24, kind: decision, said: "amy keeps itself running while the person is away, and a config or workflow change is taken by a restart asked from the chat. Decided 2026-11-09" }
  - { id: S25, kind: code, ref: "packages/cli/src/index.ts", said: "amy start spawns a detached loop and nothing brings it back; a source change is remounted by a child that must boot first, but config.yaml is not in that digest" }
  - { id: S26, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway_supervised_restart.py", said: "Hermes runs under a launchd KeepAlive agent; a restart exits back to the supervisor, and success is a fresh supervised pid, never the bare exit" }
  - { id: S27, kind: decision, said: "amy start, with no flag, starts the loop under the machine's supervisor, replacing a poll every five minutes; amy stop exits cleanly and nothing respawns it. Decided 2026-11-09" }
  - { id: S31, kind: decision, said: "macOS, Linux and Windows are all supervised in this row, each done properly. Decided 2026-11-09" }
  - { id: S32, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway_launchd.py, ~/Library/LaunchAgents/ai.hermes.gateway.plist", said: "macOS: a launchd agent with RunAtLoad, KeepAlive on SuccessfulExit false and ThrottleInterval 30" }
  - { id: S33, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway.py (_systemd_operational, _wsl_systemd_operational, _systemd_unit_is_start_limited)", said: "Linux: a systemd user unit; WSL may have no working systemd; a unit restarting too fast hits systemd's start limit and stops" }
  - { id: S34, kind: reference, ref: "https://www.freedesktop.org/software/systemd/man/latest/loginctl.html", said: "without enable-linger a user's services stop at logout and none start at boot; with it they run with no session" }
  - { id: S35, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway_windows.py", said: "Windows: schtasks /Create with an XML task, a logon trigger delayed 30s, LeastPrivilege so no elevation, RestartOnFailure; Startup folder only when the task cannot be registered, never both" }
  - { id: S36, kind: reference, ref: "https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway_windows.py _build_gateway_vbs_script", said: "a loop under cmd.exe gets CTRL_CLOSE_EVENT at logon, Task Scheduler reads it as a user cancel and RestartOnFailure never fires; wscript.exe launches it with no console" }
  - { id: S37, kind: reference, ref: "https://learn.microsoft.com/en-us/windows/win32/TaskSchd/taskschedulerschema-restartonfailure-settingstype-element", said: "RestartOnFailure needs both Count (1 to 255) and Interval (one minute to 31 days): restarts are counted, not endless" }
  - { id: S38, kind: decision, said: "one supervisor contract, chosen by platform: launchd, systemd --user, Task Scheduler. A restart exits back to it, and amy doctor names the one in use. Proposed 2026-11-09" }
  - { id: S39, kind: decision, said: "on Linux, amy doctor refuses lingering off; with no working systemd, amy start runs detached and doctor says nothing will bring it back. Proposed 2026-11-09" }
  - { id: S40, kind: decision, said: "on Windows the task starts amy through a console-less launcher, and installing it removes any Startup entry so nothing starts twice. Proposed 2026-11-09" }
  - { id: S41, kind: decision, said: "the supervisor test runs on macos-latest, ubuntu-latest and windows-latest in CI, each against the real supervisor. Proposed 2026-11-09" }
  - { id: S28, kind: decision, said: "/action restart assembles the new mount in a child first; only one that boots is let through, the loop exits to its supervisor, and the chat says the new pid. Proposed 2026-11-09" }
  - { id: S29, kind: decision, said: "the chat does not depend on the workflow mounting: a loop whose mount fails still answers in the chat, says what failed, and takes /action. Proposed 2026-11-09" }
  - { id: S30, kind: decision, said: "/action may change config.yaml as a shown diff, applied only if the new config mounts in a child; otherwise the old file stays and the chat says why. Proposed 2026-11-09" }
  - { id: S42, kind: decision, said: "a message is routed to a work first (its thread, a quote, an id); only one that reaches no work is an ask or an action, so a work reply keeps its policy. Proposed 2026-11-09" }
  - { id: S43, kind: decision, said: "with no supervisor, /action restart is refused: the running loop and the chat stay, and the chat says no supervisor would start the new one. Proposed 2026-11-09" }
  - { id: S22, kind: reference, ref: "docs/design/telegram-is-a-conversation.md", said: "only the configured operator is answered; anyone else is ignored, as Slack's isOperatorAnswer does" }
touches:
  - packages/core/src/ports/Conversation.ts
  - packages/core/src/chat/**
  - packages/core/tests/chat/**
  - plugins/slack/src/**
  - plugins/slack/tests/**
  - plugins/telegram/src/**
  - plugins/telegram/tests/**
  - packages/cli/src/daemon.ts
  - packages/cli/src/index.ts
  - packages/cli/src/config.ts
  - packages/cli/src/supervisor/**
  - packages/cli/tests/supervisor.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/doctor-conversation.test.ts
  - .github/workflows/software-factory.yml
  - packages/cli/tests/chat-action.test.ts
  - .software-factory/policy.yaml
  - packages/core/src/index.ts
  - packages/cli/src/assemble.ts
  - packages/cli/src/chat-action.ts
  - packages/cli/src/chat-pricing.ts
  - packages/cli/tests/chat-recovery.test.ts
  - packages/cli/package.json
  - package-lock.json
  - packages/cli/tests/supervisor.test.ts
  - packages/cli/tests/config.test.ts
  - plugins/telegram/src/**
  - .software-factory/evidence/amy-answers-in-the-chat/**
  - .software-factory/evidence/amy-answers-in-the-chat-scenario.sh
  - .software-factory/evidence/plugin-telegram/bot-api.ts
  - .software-factory/evidence/ticket-to-qa/bin/claude.ts
  - package.json
  - README.md
  - docs/concepts/ports.md
  - docs/concepts/architecture.md
  - docs/development/the-gate.md
  - docs/reference/cli.md
  - docs/reference/configuration.md
  - docs/reference/contracts.md
  - docs/reference/plugins.md
  - docs/start/installation.md
  - docs/start/configuration.md
  - plugins/telegram/README.md
  - registry/cli.json
  - registry/core.json
  - registry/plugin-slack.json
  - registry/plugin-telegram.json
criteria:
  - { id: A1, statement: "a message in the Telegram private chat outside every topic is answered there as an ask, and a root message in the Slack channel is answered in its thread", proof: "test:plugins/telegram/tests/TelegramConversation.chat.test.ts, test:plugins/slack/tests/SlackConversation.test.ts", sources: [S1, S2, S3, S4], done: true }
  - { id: A2, statement: "an ask runs read-only: a harness that cannot enforce it refuses, and no commit, port write or operation follows the turn", proof: "assertion:chat.an_ask_writes_nothing", sources: [S8, S9, S10, S18], done: true }
  - { id: A3, statement: "a turn starting with /action runs the amy commands its answer names; the same answer without /action runs none", proof: "assertion:chat.only_an_action_acts", sources: [S11, S12, S13], done: true }
  - { id: A4, statement: "under /action, an answer naming a command off the list, or a shell line, is refused by name and nothing runs", proof: "test:packages/cli/tests/chat-action.test.ts", sources: [S12, S13], done: true }
  - { id: A5, statement: "the third turn of a conversation carries the first two, and after /harness the new harness is given them", proof: "assertion:chat.a_conversation_carries_its_turns", sources: [S14, S21], done: true }
  - { id: A6, statement: "in Telegram without topics, a reply quoting amy's message for TBO-1 reaches TBO-1, TBO-2: reaches TBO-2, anything else is an ask, and only /new starts another", proof: "assertion:chat.a_chat_without_threads_is_addressed_not_guessed", sources: [S5, S7, S14, S15, S16], done: true }
  - { id: A7, statement: "a long turn's progress is one message edited in place where the adapter declares edit, one line per message where it does not", proof: "test:packages/core/tests/chat/progress.test.ts", sources: [S6, S16], done: true }
  - { id: A8, statement: "grooming started from the chat runs the mounted workflow's grooming, and its call log holds only the writes that workflow claims", proof: "assertion:chat.grooming_writes_what_its_workflow_claims", sources: [S17, S18], done: true }
  - { id: A9, statement: "a message from anyone but the operator answers nothing, in either adapter", proof: "test:plugins/slack/tests/SlackConversation.test.ts, test:plugins/telegram/tests/TelegramConversation.chat.test.ts", sources: [S22], done: true }
  - { id: A11, statement: "on macOS, Linux and Windows, a loop started by amy start and killed hard is running again with a new pid, and one stopped with amy stop is not", proof: "test:packages/cli/tests/supervisor.test.ts", sources: [S24, S25, S26, S27, S31, S32, S33, S35, S37, S38, S41], done: true }
  - { id: A17, statement: "on Linux with no working systemd, /action restart is refused, the loop keeps its pid and the chat still answers", proof: "test:packages/cli/tests/supervisor.test.ts", sources: [S39, S43], done: true }
  - { id: A15, statement: "amy doctor names the supervisor in use, refuses a Linux user with lingering off, and says so when no supervisor is there", proof: "test:packages/cli/tests/supervisor.test.ts", sources: [S33, S34, S38, S39], done: true }
  - { id: A16, statement: "the Windows task launches amy with no console, is registered to start at logon, and no Startup entry is left beside it", proof: "test:packages/cli/tests/supervisor.test.ts", sources: [S35, S36, S40], done: true }
  - { id: A12, statement: "/action restart with a config that does not mount leaves the running loop as it was and says why; one that mounts answers with the new pid", proof: "assertion:chat.a_restart_lets_only_a_booting_mount_through", sources: [S24, S25, S28], done: true }
  - { id: A13, statement: "a loop started with a workflow that fails to mount still answers an ask in the chat, naming the failure, and takes /action restart", proof: "assertion:chat.the_chat_outlives_a_broken_mount", sources: [S23, S29], done: true }
  - { id: A14, statement: "a config change under /action is shown as a diff and written only when the new config mounts; a refused one leaves config.yaml byte for byte", proof: "test:packages/cli/tests/chat-action.test.ts", sources: [S30], done: true }
  - { id: A10, statement: "with the chat read all the time, a work thread's /decide and an unmarked reply under policy answer still move its work, a discussion turn does not", proof: "assertion:chat.the_work_thread_still_decides", sources: [S19, S20, S42], done: true }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "A2, A4, A8" }
  - { mechanism: events-and-notifications, answer: works, proof: "A1, A7, A9" }
  - { mechanism: profiles-and-state, answer: works, proof: "A5, A10, A11, A12" }
  - { mechanism: config, answer: works, proof: "A14" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "A12, A13" }
guarantee:
  - { holds: "a message routed as an ask writes nothing: the harness runs read-only under its own sandbox and no operation is invoked; a work reply keeps its own policy", not_against: "a harness whose own sandbox is broken" }
  - { holds: "/action reaches only operations in amy's contract", not_against: "an operation whose effect is wider than the person meant" }
  - { holds: "a config or mount that does not boot never replaces the running loop, and the chat outlives a broken mount", not_against: "a machine off, asleep or offline; a Windows machine nobody has logged in to; more crashes than the task's restart count" }
  - { holds: "a chat without threads reaches a work only when the message is addressed to it", not_against: "a person quoting the wrong message" }
failures:
  - { step: restart, when: "the new mount does not boot", goes_to: "the running loop stays, and the chat names what failed" }
  - { step: restart, when: "the loop runs with no supervisor", goes_to: "refused; the loop and the chat stay, and the chat says why" }
  - { step: start, when: "Linux has no working systemd", goes_to: "the loop runs detached and amy doctor says nothing will bring it back" }
  - { step: start, when: "the loop crashes", goes_to: "the supervisor starts it again; a deliberate amy stop is not restarted" }
  - { step: ask, when: "the chosen harness cannot run read-only", goes_to: "refused, naming a harness that can" }
  - { step: action, when: "the answer names an operation the contract does not have", goes_to: "refused by name, nothing runs" }
  - { step: route, when: "a quoted message is not one amy filed under a work", goes_to: "an ask, saying it does not know which work" }
cut:
  - "a Windows Service (WinSW, NSSM): needs admin and a third-party binary; Task Scheduler needs neither (S35)"
  - "a public tunnel to reach the machine: the chat is polled outward, so nothing listens (S24)"
  - "the window, mod+k and the thread panel: plans/a-conversation-before-the-work.md (S8)"
  - "the WhatsApp adapter: this row makes the core route a chat without threads; WhatsApp comes as its own plugin (S7, S16)"
  - "acting on free text without /action: refused (S10)"
  - "grooming's writes fixed by this row: they are the workflow's (S17)"
exit: "from the phone, the person asks about a project in Telegram with nothing written, changes the config and restarts amy with /action, and it comes back from a broken mount and a killed loop"
---
# amy answers in the chat

Half the work with an agent is conversation. Here amy talks in Slack and
Telegram, the chats it already lives in: a plain message is an ask that writes
nothing, `/action` lets the turn act on amy, and a work thread still decides.
A chat with no threads, as WhatsApp's will be, is routed by what a message quotes.
On Windows the task's console-less launcher restarts a loop that did not exit
cleanly: RestartOnFailure only covers a task that fails to start.
