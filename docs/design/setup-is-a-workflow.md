---
base: 0af9e232513063af9a4502c29fca923c3a0899db
sources:
  - { id: S1, kind: decision, said: "amy init becomes amy setup, an onboarding like hermes setup; init stays as an alias. Decided 2026-11-05" }
  - { id: S2, kind: decision, said: "setup is itself an amy workflow, raw, drawn in workflow.mmd, running on the person's machine: amy set up by amy. Decided 2026-11-05" }
  - { id: S3, kind: decision, said: "its first question is which harness the person uses; only that plugin is installed, then the walk goes on from there. Decided 2026-11-05" }
  - { id: S4, kind: decision, said: "amy setup <plugin>, such as amy setup slack, goes straight to configuring that one plugin. Decided 2026-11-05" }
  - { id: S5, kind: decision, said: "the rename lands before the-command-line-holds-no-rule, whose cut refuses renaming a command while it moves. Decided 2026-11-05" }
  - { id: S6, kind: reference, ref: "packages/cli/src/index.ts", said: "init makes the state directories, writes EXAMPLE_CONFIG when absent, prepares plugin files and setups, and installs what the config names; it asks the person nothing" }
  - { id: S7, kind: code, ref: "packages/cli/src/harnesses.ts", symbol: "harnesses", said: "a harness is detected by its home directory; claude and hermes are known, codex is not" }
  - { id: S8, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "the command arrives alone and depends on no workflow; only what the person chooses is installed" }
  - { id: S9, kind: reference, ref: "plans/the-command-line-holds-no-rule.md", said: "init exists so the window can onboard a person; its questions become typed fields an agent passes as flags, and every answer as a flag writes the same install" }
  - { id: S10, kind: reference, ref: "plans/a-plugin-says-what-it-is.md", said: "a package's kinds are read from its manifest, primary first" }
  - { id: S11, kind: reference, said: "a-question-carries-its-answers (#162): a question can carry its answers: approval, choice or choices, answered as a typed decision" }
  - { id: S12, kind: reference, said: "a-harness-answers-before-the-work (#163): each harness plugin pings the models it was given as an amy doctor check" }
  - { id: S13, kind: reference, said: "hermes setup: named sections run alone by name, a re-run offers current values as defaults, and without a terminal it prints the commands that would do it" }
  - { id: S14, kind: decision, said: "the CLI depends on what a machine with nothing installed needs to run setup: the setup workflow, the serial engine and the terminal conversation. That is where they ship from, not a difference in how setup runs" }
  - { id: S15, kind: decision, said: "amy setup is the event that starts one record of the setup workflow, which ends at [*]; it mounts in a profile named setup, runs on the engine and is kept by the store as any workflow's record is" }
  - { id: S16, kind: decision, said: "every question is an ask on the conversation port; the terminal conversation is a plugin like Slack or Telegram, posting to stdout and reading a line or a numbered choice, and it is not part of the setup package" }
  - { id: S17, kind: decision, said: "the states: DETECTING, HARNESS, PLUGIN_INSTALLED, PINGED, WORKFLOW, CHANNELS, CONFIGURING, CHECKED, DONE, STOPPED; amy setup <plugin> starts the same record at PLUGIN_INSTALLED for that plugin" }
  - { id: S18, kind: decision, said: "the harness ask offers claude, codex and hermes, with the ones detected on this machine first; codex is detected by its home directory too" }
  - { id: S19, kind: decision, said: "channels is one choices ask listing the conversation and notifier plugins grouped by kind; each one chosen is configured by prompting its configSchema" }
  - { id: S20, kind: decision, said: "a flag answers its ask before it is asked, and with no terminal an unanswered ask stops the walk, printing the amy setup flags that would answer it" }
  - { id: S21, kind: decision, said: "on a machine already set up, each ask offers the value config.yaml holds as its default" }
  - { id: S22, kind: decision, said: "setup is a workflow like any other, with nothing special about it; it differs only in depending on the person's input at some steps and in running once. Decided 2026-11-05" }
  - { id: S23, kind: decision, said: "when the window (desktop or terminal) exists, setup is connected to it so the person gets a nicer experience: the window draws the same asks, and the workflow does not change for it. Decided 2026-11-05" }
  - { id: S24, kind: reference, ref: "plans/a-workflow-starts-on-an-event.md", said: "a workflow may begin on an event and end once dealt with; each such event starts one record" }
  - { id: S25, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "the window's right panel holds the work thread of a record waiting on its owner, and a turn from it goes through the conversation port" }
  - { id: S26, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "a plugin's operation input is accepted only as a root object of string, number, integer, boolean, enum or array-of-those fields, a #/$defs ref followed once; everything else is refused at mount, and every door, setup included, reads this one rule" }
  - { id: S27, kind: code, ref: "packages/core/src/config-schema.ts", said: "a plugin's configSchema is amy's own closed format, not JSON Schema: five types, string, number, boolean, string[] and record, and a dotted key names a leaf of a group" }
  - { id: S28, kind: decision, said: "setup asks a string, number, boolean or string[] field; a plugin whose configSchema has a record field is refused by amy setup, naming the field, and no config for it is written. Decided 2026-11-08" }
  - { id: S29, kind: decision, said: "a failure is a success, a declared refusal or an internal error, and nothing reads as green unread: a config.yaml that cannot be read or written stops the walk at STOPPED naming it, never read as nothing set. Decided 2026-11-08" }
  - { id: S30, kind: decision, said: "the terminal conversation ships as @amykit/plugin-terminal-conversation at plugins/terminal-conversation; plugins/terminal is the terminal-use driver a-phase-is-proven-not-asserted landed" }
touches:
  - packages/workflow-setup/**
  - plugins/terminal-conversation/**
  - packages/cli/package.json
  - packages/cli/src/index.ts
  - packages/cli/src/setup.ts
  - packages/cli/src/harnesses.ts
  - packages/cli/src/add.ts
  - packages/cli/src/config.ts
  - packages/cli/src/paths.ts
  - packages/cli/tests/setup.test.ts
  - packages/cli/skills/amy-init/SKILL.md
  - docs/start/installation.md
  - docs/start/quickstart.md
  - docs/reference/cli.md
criteria:
  - { id: A1, statement: "amy setup and amy init run the same walk, and the setup workflow's diagram mounts with every state drawn and decided", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts, test:packages/cli/tests/setup.test.ts", sources: [S1, S2, S5, S14, S17, S22], done: true }
  - { id: A2, statement: "on a fresh home the first ask is the harness, detected ones first; choosing codex installs only the codex plugin and writes a codex ladder", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S3, S7, S8, S18], done: true }
  - { id: A3, statement: "after the harness is installed its setup and its doctor ping run, and a failed ping stops the walk naming the model", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S12], done: true }
  - { id: A4, statement: "the channels ask lists conversation and notifier plugins grouped by kind, and each chosen one is configured from its configSchema", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S10, S19], done: true }
  - { id: A5, statement: "amy setup slack on a configured machine installs slack if absent, asks its settings with current values as defaults, writes its slice and runs its checks", proof: "test:packages/cli/tests/setup.test.ts", sources: [S4, S13, S17, S21], done: true }
  - { id: A6, statement: "for any set of answers, giving them all as flags writes the same config.yaml as answering them in the terminal", proof: "property:packages/cli/tests/setup.test.ts#flags_skip_a_question", sources: [S9, S20], done: true }
  - { id: A7, statement: "with no terminal and an ask unanswered, the walk stops and prints the flags that answer it, writing nothing more", proof: "test:packages/cli/tests/setup.test.ts", sources: [S13, S20], done: true }
  - { id: A8, statement: "the terminal conversation answers an ask with the chosen answer, through the same port and reply shape Slack and Telegram return", proof: "test:plugins/terminal-conversation/tests/terminal-conversation.test.ts", sources: [S11, S16, S22, S30], done: true }
  - { id: A9, statement: "amy setup starts one record in the setup profile, the store keeps it as any record, and once it reaches [*] nothing looks at it again", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S6, S15, S22, S24], done: true }
  - { id: A10, statement: "the whole walk reaches DONE with the testkit's fake conversation in place of the terminal, and no setup step reads stdin or writes stdout itself, so a window conversation answers it unchanged", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S16, S23, S25], done: true }
  - { id: A11, statement: "choosing a plugin whose configSchema has a record field is refused by amy setup naming the field, and no config for it is written", proof: "test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S27, S28], done: true }
  - { id: A12, statement: "a config.yaml that does not parse, or cannot be written, stops the walk at STOPPED naming the file; no ask offers an empty default because of it", proof: "test:packages/cli/tests/setup.test.ts", sources: [S21, S29], done: true }
  - { id: A13, statement: "an operation setup reaches takes only input inside the shared accepted set, and A6's property runs over that set alone", proof: "test:packages/cli/tests/setup.test.ts", sources: [S9, S26], done: true }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "test:packages/workflow-setup/tests/walkthrough.test.ts (A2), test:packages/cli/tests/setup.test.ts (A5); the walk installs through amy add's path" }
  - { mechanism: config, answer: works, proof: "property:packages/cli/tests/setup.test.ts#flags_skip_a_question (A6); every write goes through the typed config writers amy add uses" }
  - { mechanism: profiles-and-state, answer: works, proof: "test:packages/workflow-setup/tests/walkthrough.test.ts (A9); setup's record lives in its own setup profile and touches no other profile's state" }
  - { mechanism: diagram, answer: works, proof: "test:packages/workflow-setup/tests/walkthrough.test.ts (A1)" }
  - { mechanism: record-migration, answer: n/a, why: "a new workflow; no older setup record exists to read" }
  - { mechanism: workflow-tooling, answer: works, proof: "test:packages/workflow-setup/tests/conformance.test.ts (A1); the testkit walks every drawn edge" }
guarantee:
  - { holds: "only the harness, workflow and plugins the person chose are installed", not_against: "a chosen plugin's own dependencies, which npm installs with it" }
  - { holds: "a re-run never overwrites a value the person did not answer anew", not_against: "a hand edit to config.yaml made while setup is running" }
  - { holds: "every field setup asks or spells as a flag is one of the four askable configSchema types", not_against: "a plugin that validates a field further in its own register, which setup reports as that plugin's refusal" }
failures:
  - { step: read-config, when: "config.yaml does not parse or cannot be read", goes_to: "STOPPED naming the file and the parser's first error; never read as nothing set" }
  - { step: write-config, when: "config.yaml cannot be written (ENOSPC, permissions)", goes_to: "STOPPED naming the file, as an internal error, not a refusal" }
  - { step: choose-plugin, when: "the chosen plugin's configSchema has a record field", goes_to: "refused naming the plugin and the field; no config for it is written" }
  - { step: install, when: "npm cannot install the chosen plugin", goes_to: "STOPPED naming the package and npm's first error line" }
  - { step: ping, when: "a model the ladder names does not answer", goes_to: "STOPPED naming the model; amy setup <harness> resumes from that plugin" }
cut:
  - "a curses menu library: the terminal adapter reads lines and numbers"
  - "setting up a workflow's own settings beyond amy add's block: that is amy setup <workflow>"
  - "drawing setup in the window: when the-work-is-listed-everywhere lands, its asks show there through the conversation port, with no change to the setup workflow"
deviations:
  - "A6's any set of answers is any complete set: the walk asks every field of a chosen plugin's schema (S19), so a set that answers them all is what both sides of the property can carry — a field left unanswered by flags stops the walk asking for it, which is A7's stop, not a config"
  - "a scoped record's id flattens the spec's slash (@amykit/plugin-slack walks as @amykit-plugin-slack), because a record's id is the one file the store and the queue keep for it"
  - "the setup profile is written only once the walk is one the machine will answer: with no conversation mounted and no flag answered, the walk stops at its first ask having written no config.yaml at all (A7's writing nothing more)"
exit: "on a machine with nothing configured, amy setup asks which harness, installs only Codex, pings its model, adds a workflow and Slack, and a second amy setup slack shows the saved values as defaults"
---
# Setup is a workflow

`amy init` wrote a template and left the person to it. `amy setup` asks, one
question at a time, and is itself an amy workflow drawn in Mermaid: one like
any other, started once by `amy setup`, asking the person through the same
conversation port every workflow uses, so the window can draw it later.
