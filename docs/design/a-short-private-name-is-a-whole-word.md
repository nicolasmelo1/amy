---
base: 7a439089212bce22ef48e19e4e10b1734a3e6cff
sources:
  - { id: S1, kind: friction, said: "2026-11-14: an audit of this public repository found a company's ticket key in its docs, tests and evidence, one real ticket's description quoted, and the private-name check blind to it" }
  - { id: S2, kind: code, ref: "packages/cli/src/private-refs.ts", symbol: "findPrivateReferences", said: "every denied term is matched as a window inside a word, so a three-letter key would fire on outbox, requestBody and whatBoots" }
  - { id: S4, kind: decision, said: "the key is denied as a whole word, by digest, and every example names tickets PROJ-, the placeholder the suite already used. Decided 2026-11-14" }
  - { id: S5, kind: decision, said: "a delivered note whose declaration carries a private name is groomed again in a commit of its own: a commit touching only plans/, docs/design/ and docs/mechanisms.yaml is grooming. Decided 2026-11-14" }
touches:
  - docs/build/prove-a-phase.md
  - docs/concepts/ports.md
  - docs/design/a-plugin-command-is-a-command-too.md
  - docs/design/a-workflow-calls-another.md
  - docs/design/a-workflow-runs-on-lanes.md
  - docs/design/amy-answers-in-the-chat.md
  - docs/design/the-ticket-body-reaches-the-agent.md
  - docs/development/the-gate.md
  - docs/guides/the-chat.md
  - docs/rules.md
  - examples/workflow-errand/CHANGELOG.md
  - examples/workflow-feature-grooming/tests/walkthrough.test.ts
  - examples/workflow-note-to-plan/CHANGELOG.md
  - examples/workflow-pull-request/CHANGELOG.md
  - examples/workflow-pull-request/tests/hosts.test.ts
  - examples/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - packages/cli/CHANGELOG.md
  - packages/cli/src/private-refs.ts
  - packages/cli/tests/chat-action.test.ts
  - packages/cli/tests/private-refs.test.ts
  - packages/cli/tests/status-page.test.ts
  - packages/core/CHANGELOG.md
  - packages/core/src/work.ts
  - packages/core/tests/chat/commands.test.ts
  - packages/core/tests/chat/desk.test.ts
  - packages/core/tests/chat/route.test.ts
  - packages/workflow-testkit/tests/calls.test.ts
  - plugins/github/CHANGELOG.md
  - plugins/github/tests/GitHubCodeHost.test.ts
  - plugins/linear/tests/LinearTracker.test.ts
  - plugins/prove/src/operations.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/tests/budget.test.ts
  - plugins/prove/tests/fixtures.test.ts
  - plugins/prove/tests/human-step.test.ts
  - plugins/prove/tests/lease.test.ts
  - plugins/prove/tests/proof-record.test.ts
  - plugins/prove/tests/replay.test.ts
  - plugins/prove/tests/resources.test.ts
  - plugins/prove/tests/scenario.test.ts
  - plugins/prove/tests/steps.test.ts
  - plugins/slack/tests/SlackConversation.test.ts
  - plugins/telegram/tests/TelegramConversation.chat.test.ts
  - plugins/telegram/tests/TelegramConversation.test.ts
  - registry/cli.json
  - registry/core.json
  - registry/plugin-prove.json
  - scripts/check-private-refs.ts
  - scripts/plans/tests/authored.test.ts
  - scripts/plans/tests/contributed.test.ts
  - scripts/private-terms.json
  - .software-factory/rules/a-private-name-stays-private.yaml
  - scripts/plans/held.ts
  - scripts/plans/tests/held.test.ts
  - CONTRIBUTING.md
  - plugins/agent-relay/CHANGELOG.md
  - plugins/claude/CHANGELOG.md
  - plugins/codex/CHANGELOG.md
criteria:
  - { id: A1, statement: "a term marked word is found where a separator stands it alone and never inside a longer word", proof: "test:packages/cli/tests/private-refs.test.ts", sources: [S1, S2, S4], done: true }
  - { id: A2, statement: "a whole-word term judged beside windowed terms hides neither", proof: "test:packages/cli/tests/private-refs.test.ts", sources: [S2], done: true }
  - { id: A3, statement: "a commit touching only delivered notes grooms them, and one that also touches code is still refused", proof: "test:scripts/plans/tests/held.test.ts", sources: [S5], done: true }
crosses:
  - { mechanism: record-migration, answer: n/a, why: "work.ts changes one comment's example id; no record shape moves" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "work.ts changes one comment's example id; no attempt or wait moves" }
guarantee:
  - { holds: "no file in the tree, tracked or new, names a denied term, and sf check fails when one does", not_against: "the history and the pull request bodies, which no commit reaches" }
failures:
  - { step: check-private-refs, when: "packages/cli/dist is not built", goes_to: "it says to run npm run build and fails" }
cut:
  - "rewriting the history and the pull request bodies that still carry the names"
exit: "the tree names tickets PROJ- only, the key is denied as a whole word, and the private-name rule fires on its mutation"
---
# A short private name is a whole word

An audit found a company's ticket key throughout this public repository, and
the private-name check could not deny a three-letter term without firing on
ordinary words. A term can now be denied as a whole word, the examples say
PROJ-, and the check runs as a software-factory rule.
