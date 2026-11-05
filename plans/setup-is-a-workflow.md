---
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
  - { id: S14, kind: decision, said: "the setup workflow ships with the CLI as its one dependency that is a workflow, because a machine with nothing installed must be able to set itself up; no profile ever mounts it" }
  - { id: S15, kind: decision, said: "amy setup runs it in its own process, one look after another until the record settles or waits on the person; its record lives under amy's home in setup/records" }
  - { id: S16, kind: decision, said: "its conversation is the terminal: a terminal adapter inside the setup package posts to stdout and reads a line or a numbered choice, so every question is an ask" }
  - { id: S17, kind: decision, said: "the states: DETECTING, HARNESS, PLUGIN_INSTALLED, PINGED, WORKFLOW, CHANNELS, CONFIGURING, CHECKED, DONE, STOPPED; amy setup <plugin> starts the same record at PLUGIN_INSTALLED for that plugin" }
  - { id: S18, kind: decision, said: "the harness ask offers claude, codex and hermes, with the ones detected on this machine first; codex is detected by its home directory too" }
  - { id: S19, kind: decision, said: "channels is one choices ask listing the conversation and notifier plugins grouped by kind; each one chosen is configured by prompting its configSchema" }
  - { id: S20, kind: decision, said: "a flag answers its ask before it is asked, and with no terminal an unanswered ask stops the walk, printing the amy setup flags that would answer it" }
  - { id: S21, kind: decision, said: "on a machine already set up, each ask offers the value config.yaml holds as its default" }
touches:
  - packages/workflow-setup/**
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
  - { id: A1, statement: "amy setup and amy init run the same walk, and the setup workflow's diagram mounts with every state drawn and decided", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S1, S2, S5, S14, S17] }
  - { id: A2, statement: "on a fresh home the first ask is the harness, detected ones first; choosing codex installs only the codex plugin and writes a codex ladder", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S3, S7, S8, S18] }
  - { id: A3, statement: "after the harness is installed its setup and its doctor ping run, and a failed ping stops the walk naming the model", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S12] }
  - { id: A4, statement: "the channels ask lists conversation and notifier plugins grouped by kind, and each chosen one is configured from its configSchema", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S10, S19] }
  - { id: A5, statement: "amy setup slack on a configured machine installs slack if absent, asks its settings with current values as defaults, writes its slice and runs its checks", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S4, S13, S17, S21] }
  - { id: A6, statement: "for any set of answers, giving them all as flags writes the same config.yaml as answering them in the terminal", proof: "deferred:property:packages/cli/tests/setup.test.ts#flags_skip_a_question", sources: [S9, S20] }
  - { id: A7, statement: "with no terminal and an ask unanswered, the walk stops and prints the flags that answer it, writing nothing more", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S13, S20] }
  - { id: A8, statement: "the terminal adapter answers an ask with the chosen answer, and the setup record is kept under setup/records, never in a profile", proof: "deferred:test:packages/workflow-setup/tests/terminal.test.ts", sources: [S6, S11, S15, S16] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:A2, A5; the walk installs through amy add's path" }
  - { mechanism: config, answer: works, proof: "deferred:A6; every write goes through the typed config writers amy add uses" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A8; setup's record has its own directory and touches no profile's state" }
  - { mechanism: diagram, answer: works, proof: "deferred:A1" }
  - { mechanism: record-migration, answer: n/a, why: "a new workflow; no older setup record exists to read" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A1; the testkit walks every drawn edge" }
guarantee:
  - { holds: "only the harness, workflow and plugins the person chose are installed", not_against: "a chosen plugin's own dependencies, which npm installs with it" }
  - { holds: "a re-run never overwrites a value the person did not answer anew", not_against: "a hand edit to config.yaml made while setup is running" }
failures:
  - { step: install, when: "npm cannot install the chosen plugin", goes_to: "STOPPED naming the package and npm's first error line" }
  - { step: ping, when: "a model the ladder names does not answer", goes_to: "STOPPED naming the model; amy setup <harness> resumes from that plugin" }
cut:
  - "a curses menu library: the terminal adapter reads lines and numbers"
  - "setting up a workflow's own settings beyond amy add's block: that is amy setup <workflow>"
exit: "on a machine with nothing configured, amy setup asks which harness, installs only Codex, pings its model, adds a workflow and Slack, and a second amy setup slack shows the saved values as defaults"
---
# Setup is a workflow

`amy init` writes a template and leaves the person to it. `amy setup` asks, one
question at a time, and is itself an amy workflow drawn in Mermaid.
