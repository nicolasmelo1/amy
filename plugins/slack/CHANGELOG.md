# @amykit/plugin-slack

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- ebae48c: **A reply in a work's thread can be a question, not only an answer.**
  
  When `ticket-to-qa` escalated, or asked a question before starting, the owner's
  first message in the thread ended the wait and the work resumed on it. A person
  who replied "why do you think that comment is wrong?" had not decided anything,
  and watched their question turn into work.
  
  - `Reply` gains an optional `kind`, `discussion` or `decision`, set only when
    the person marked the reply. The catalogue gains `discuss`, on the `agent`
    port, so it is charged to the budget like every other run.
  - `policy.conversation` on `ticket-to-qa`: `answer`, the default, reads a reply
    nobody marked as the decision, exactly as before. `discuss` reads it as a turn
    in a discussion: answered in the thread, read-only, with no state change, no
    commit and no attempt counted, while the work waits for a reply marked as the
    decision. A marked reply reads as marked under either. An unknown value is
    refused at boot by name.
  - `AskContext` gains `readOnly`, and a discussion is asked with it. The
    harness enforces it rather than the prompt: Claude runs with
    `--permission-mode plan`, Codex with `--sandbox read-only`, and Hermes, whose
    one-shot mode cannot keep its tools off the checkout, refuses the run so a
    relay hands it to a harness that can.
  - On the decision, the step the work resumes is prompted with the whole
    discussion, attributed, with the decision last.
  - The Slack plugin marks a reply by the operator's own reaction on it: ✅
    (`white_check_mark`) decides, 💬 (`speech_balloon`) discusses. Both names are
    settings, `decisionReaction` and `discussionReaction`. A reaction Slack lists
    only in part is read again in full with `reactions.get`, which needs the
    `reactions:read` scope; without it, that one read fails and says so.
  - Without a conversation port, a comment on the ticket is still the decision,
    whatever the policy says.
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
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.

### Patch Changes

- cea9b94: **A lock is taken one way.**
  
  The core exports `takeLock` and `processAlive`. A lock is a file naming its
  owner, published whole, so a lock being taken is never read as one its owner
  abandoned; one whose owner died, or whose lease ran out unrenewed, is taken
  over through a tombstone only one process can create, so of everyone who saw
  the same dead owner exactly one removes it. A process that dies in the middle of
  that leaves its tombstone, swept within the hour, and only then is the lock
  buried again: finishing sooner could let two finishers remove a new owner's
  lock. A lock an earlier version left —
  a pid line, a `pid:token` line, a bare token or a directory holding
  `owner.json` — is read and recovered the same way.
  
  The daemon boundary, the config `/action` applies, a chat message's claim and
  the proof's lease lock all take it, and nothing else asks whether a process
  lives. The daemon boundary no longer removes a lock another process had
  opened and not yet written its pid into.
- 69dfe62: **The chat recovers, pays and reads fairly.**
  
  When the workflow does not mount, the chat's recovery grows one group of
  plugins a mount at a time instead of trying every subset, and keeps a
  thread-only adapter out of the way of one that can answer in the chat. Under
  `chat.budget` with a dollar ceiling, `/harness` no longer offers a harness
  whose turns nothing can price. A config lock left by a dead writer is cleared
  under a guard named after the owner that was seen dead, so a writer acting on
  an old look never removes a replacement. In Slack, work-thread reads no
  longer hold the chat's follow-ups unread: the chat reads by its second minute
  at the latest.
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

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Minor Changes

- c1edd17: Add a Slack adapter for the conversation port: one thread per piece of work over the Web API, operator-only replies with downloaded files, `Retry-After` backoff, and `amy doctor` checks for the token, channel and scopes.

### Patch Changes

- b8c781a: Let a project keep three phases — `brief/`, `workflow/`, `test/` — that share briefs while keeping state and spending isolated. Every such folder is a phase, a lone `workflow/` included, so its state moves under the project key and nothing is kept from an old profile of the same name. Each phase keeps its own tasks and Slack threads, `amy brief` names the missing `brief/` when a project has none, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.
- Updated dependencies [d490ceb]
- Updated dependencies [b8c781a]
- Updated dependencies [c1edd17]
- Updated dependencies [5ff03ad]
- Updated dependencies [3a993e1]
- Updated dependencies [f259468]
- Updated dependencies [75e1f57]
- Updated dependencies [8b2fcc8]
- Updated dependencies [9bb3d24]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0
