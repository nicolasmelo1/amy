---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: friction, said: "2026-11-12: setup walks steps one, two and three for each thing; somebody who does not know what each workflow does is lost, and following the error messages alone is confusing" }
  - { id: S2, kind: decision, said: "nothing is installed by default, but setup shows the one command that installs every plugin each workflow of the project needs. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "each plugin explains its own setup step by step, the way Hermes does: which page to open, what to create, which scopes to grant. Minimum friction. Decided 2026-11-12" }
  - { id: S4, kind: code, ref: "packages/workflow-setup/src/asks.ts", symbol: "workflowAsk", said: "the workflow ask offers bare names; a setting is asked as its field name and its schema description" }
  - { id: S5, kind: code, ref: "packages/workflow-setup/src/ports/Catalog.ts", symbol: "WorkflowChoice", said: "a workflow choice carries its name, its package and whether it is current: nothing on what it does or what it needs" }
  - { id: S6, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "port", said: "a workflow declares the ports it needs, not the plugins that fill them" }
  - { id: S7, kind: code, ref: "packages/cli/src/add.ts", said: "amy add takes one spec at a time" }
  - { id: S8, kind: code, ref: "plugins/slack/package.json", said: "the Slack plugin's amy.about says it needs a bot token; nothing says where to make one or which scopes it needs" }
  - { id: S9, kind: code, ref: "plugins/slack/src/SlackApi.ts", symbol: "SlackApi", said: "Web API only, no Socket Mode: auth.test, chat.postMessage, update and delete, conversations.history, info and replies, reactions.add and get" }
  - { id: S10, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack", said: "nine numbered steps; the app is created at api.slack.com/apps from a manifest `hermes slack manifest --agent-view --write` writes, so scopes and events arrive filled in" }
  - { id: S11, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/", said: "hermes gateway setup is one interactive walk over every platform, showing which are already configured" }
  - { id: S12, kind: decision, said: "a plugin's guide is data in its package.json amy block: numbered steps, each with its words, an optional link and what to copy back; read without importing the plugin. Proposed 2026-11-12" }
  - { id: S13, kind: decision, said: "the Slack plugin writes its own app manifest whose bot scopes are exactly what its Web API calls need, as Hermes does. Proposed 2026-11-12" }
  - { id: S14, kind: decision, said: "every ask carries one line saying what the answer changes; a workflow choice says what it does and the ports it needs. Proposed 2026-11-12" }
  - { id: S15, kind: decision, said: "the install line is one amy add naming every package; amy add takes several specs and installs all or none. Proposed 2026-11-12" }
touches:
  - packages/workflow-setup/src/asks.ts
  - packages/workflow-setup/src/ports/Catalog.ts
  - packages/workflow-setup/src/machine.ts
  - packages/workflow-setup/tests/walkthrough.test.ts
  - packages/workflow-setup/tests/asks.property.test.ts
  - packages/cli/src/setup.ts
  - packages/cli/tests/setup.test.ts
  - packages/cli/src/add.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/add.test.ts
  - plugins/slack/package.json
  - plugins/slack/src/manifest.ts
  - plugins/slack/src/plugin.ts
  - plugins/slack/tests/manifest.test.ts
  - plugins/telegram/package.json
  - plugins/linear/package.json
  - plugins/github/package.json
  - scripts/docs/render/readme.ts
  - scripts/docs/tests/plugin-readme.test.ts
  - plugins/slack/README.md
  - plugins/telegram/README.md
  - plugins/linear/README.md
  - plugins/github/README.md
  - docs/reference/cli.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/setup-explained-scenario.sh
criteria:
  - { id: A1, statement: "the workflow ask shows each workflow with one line on what it does and the ports it needs, read from its package", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S1, S4, S5, S6, S14] }
  - { id: A2, statement: "for any catalog and any plugin schema, every ask and every setting post setup sends carries a line saying what the answer changes", proof: "deferred:property:packages/workflow-setup/tests/asks.property.test.ts#an_ask_without_why", sources: [S1, S14] }
  - { id: A3, statement: "once the workflow and channels are answered, setup shows one amy add line naming every package they need, before it installs anything", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S2, S6, S15] }
  - { id: A4, statement: "amy add with several specs installs them all, or none when one cannot be resolved, naming that one", proof: "deferred:test:packages/cli/tests/add.test.ts", sources: [S7, S15] }
  - { id: A5, statement: "a plugin's guide shows as numbered steps with their links when setup configures it, when `amy setup` names it, and in its README", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S3, S8, S11, S12] }
  - { id: A6, statement: "the Slack plugin's app manifest asks for exactly the bot scopes its Web API calls need, and no event subscription", proof: "deferred:test:plugins/slack/tests/manifest.test.ts", sources: [S9, S10, S13] }
  - { id: A7, statement: "Slack, Telegram, Linear and GitHub each ship a guide saying where to go, what to create, what to grant and where the secret is kept", proof: "deferred:test:scripts/docs/tests/plugin-readme.test.ts", sources: [S3, S8, S10, S12] }
  - { id: A8, statement: "the built CLI, in another process on fakes, walks setup to doctor; every ask it printed has its line, and the amy add line names exactly the packages mounted at the end", proof: "assertion:setup.every_step_says_what_it_is_for", sources: [S1, S2, S14] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:test:packages/cli/tests/add.test.ts" }
  - { mechanism: events-and-notifications, answer: n/a, why: "the Slack plugin only gains a manifest it prints; nothing it posts or reads changes" }
guarantee:
  - { holds: "every ask setup sends says what its answer changes, and the install line names every package the answers need", not_against: "a plugin author's guide that is wrong or out of date" }
  - { holds: "the Slack manifest grants no scope the plugin does not call", not_against: "a scope Slack renames or splits" }
failures:
  - { step: configuring, when: "a plugin ships no guide", goes_to: "setup says so and asks its settings with their descriptions, as today" }
  - { step: amy add, when: "one of several specs cannot be resolved", goes_to: "nothing installed, naming the spec" }
cut:
  - "driving a vendor's site for the person: setup says where to click, the person clicks"
  - "Socket Mode for Slack: the plugin is Web API only (S9)"
exit: "somebody who never read amy's docs runs `amy setup`, picks ticket-to-qa and Slack, reads what each answer changes and the one amy add line, makes the Slack app from the printed manifest, and ends with doctor green"
---
# Every setup step says what it is for

Setup asks for names and settings without saying what they do, so a newcomer
learns from error messages. Each ask now says what its answer changes. Each
plugin carries its own step-by-step guide, Slack prints its app manifest, and
setup shows the one `amy add` line for everything the answers need.
