---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: decision, said: "/action means perform something: any change the harness can make, editing code or dropping a database, not only amy commands; today's read-only /action is a bug. Decided 2026-11-12" }
  - { id: S2, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "readOnlyAnswer", said: "every chat turn, /action included, asks its harness with readOnly true, and promptFor tells it the turn is read-only" }
  - { id: S3, kind: reference, ref: "docs/design/amy-answers-in-the-chat.md", said: "S12, Proposed 2026-11-09: under /action too the harness runs read-only, and its answer names amy commands from a fixed list" }
  - { id: S4, kind: reference, ref: "docs/design/a-skill-is-asked-for-in-the-chat.md", said: "A7: the harness still runs read-only in a skill turn, and what acts is the amy commands its answer names" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", symbol: "chatReader", said: "a chat turn runs in the profile's project root, or in amy's home when the profile has no project" }
  - { id: S6, kind: code, ref: "plugins/claude/src/config.ts", symbol: "permissionMode", said: "a writing Claude run goes under acceptEdits, auto or bypassPermissions; a read-only one under plan" }
  - { id: S7, kind: reference, ref: "https://code.claude.com/docs/en/permission-modes", said: "acceptEdits runs edits and common filesystem commands only; under -p a call needing approval is denied; auto sends shell commands to a classifier; bypassPermissions runs everything" }
  - { id: S8, kind: decision, said: "an action turn asks its harness to write, under that harness's configured writing mode; what it can do is what that mode allows, and amy promises nothing beyond it. Proposed 2026-11-12" }
  - { id: S9, kind: decision, said: "an action turn runs where every chat turn runs, the project root or amy's home, and says where in its answer. Proposed 2026-11-12" }
  - { id: S10, kind: decision, said: "every action turn is a chat.action event: harness, where it ran, outcome, and the files git reports changed when that place is a repository. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "the amy block still runs under /action, from the same fixed list, after the harness's own changes. Proposed 2026-11-12" }
  - { id: S12, kind: reference, ref: "docs/design/amy-answers-in-the-chat.md", said: "A2: a message without /action is an ask, read-only, enforced by the harness's sandbox or refused" }
touches:
  - packages/core/src/chat/desk.ts
  - packages/core/tests/chat/desk.test.ts
  - packages/core/tests/chat/action.property.test.ts
  - packages/core/events.json
  - packages/cli/src/index.ts
  - packages/cli/tests/chat-action.test.ts
  - docs/guides/the-chat.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/amy-answers-in-the-chat-scenario.sh
  - .software-factory/evidence/amy-answers-in-the-chat/drive.ts
criteria:
  - { id: A1, statement: "a turn starting with /action asks its harness with readOnly false, and its prompt says it may change things and must say what it changed", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S1, S2, S8] }
  - { id: A2, statement: "for any message that does not start with /action, quoted ones included, the harness is asked read-only", proof: "deferred:property:packages/core/tests/chat/action.property.test.ts#a_plan_turn_writes", sources: [S2, S12] }
  - { id: A3, statement: "an action turn runs in the project root, or in amy's home without a project, and its answer names that place", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S5, S9] }
  - { id: A4, statement: "every action turn writes one chat.action event with its harness, place and outcome, and the files changed when the place is a repository", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S10] }
  - { id: A5, statement: "for any action turn, exactly one chat.action event is written, whether the harness completed, failed or was refused", proof: "deferred:property:packages/core/tests/chat/action.property.test.ts#an_action_left_unrecorded", sources: [S10] }
  - { id: A6, statement: "an action whose answer names amy commands runs them from the list after the harness's changes; a command off the list is refused and nothing more runs", proof: "deferred:test:packages/cli/tests/chat-action.test.ts", sources: [S3, S11] }
  - { id: A7, statement: "a Claude action turn runs under the configured permissionMode, never plan, and an ask under plan", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S6, S7, S8] }
  - { id: A8, statement: "on the fakes, a plan turn asking to edit a file leaves it unchanged; the same text under /action changes it, logs chat.action, and the next plan turn reads the change", proof: "assertion:chat.an_action_acts", sources: [S1, S4, S8, S10] }
crosses:
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A4, A5" }
  - { mechanism: agent-replies, answer: n/a, why: "the reply is read as today; only readOnly and the prompt change, and a failed run is refused as before" }
guarantee:
  - { holds: "only a message starting with /action ever asks a harness to write", not_against: "a harness whose read-only sandbox is broken" }
  - { holds: "an action can do what the harness's configured writing mode lets it, and is recorded", not_against: "what that mode allows: under bypassPermissions an action can drop a database" }
failures:
  - { step: action, when: "the harness cannot write or its run fails", goes_to: "said, recorded as chat.action with that outcome; no amy command runs" }
  - { step: action, when: "the place is not a repository", goes_to: "the event carries no changed files and says so" }
cut:
  - "a sandbox of amy's own around an action: the harness's writing mode is the boundary (S8)"
  - "an action inside a record's worktree: the window's chat, the chat is one button away"
  - "action as the default in Slack and Telegram: each message there still starts with /action"
exit: "in Slack, /action add a line to README.md edits the file in the project root, records chat.action naming it, and the same text without /action changes nothing"
---
# An action acts

`/action` runs today with the harness read-only: all it can do is name amy commands. The person meant "do it": edit code, run a migration, drop a database. This plan lets an action turn write under the harness's own writing mode and records each one. It supersedes A7 of *a skill is asked for in the chat*, now delivered.
