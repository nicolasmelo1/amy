---
base: 1471c13ea5a21e998b417b336683844b0932092f
sources:
  - { id: S1, kind: decision, said: "two floating buttons at the window's bottom right: a question mark that lists every command, and beside it the chat. Decided 2026-11-12" }
  - { id: S2, kind: decision, said: "the chat opens in plan mode, and its top switches to action mode. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "action can be saved as the mode the chat opens in; the person proposed holding the action button, or a command in the terminal. Decided 2026-11-12" }
  - { id: S4, kind: decision, said: "a hold is undiscoverable on a desktop, so saving is an explicit 'open in this mode' in the mode menu and a terminal command; a hold is only a shortcut. Proposed 2026-11-12" }
  - { id: S5, kind: decision, said: "the chat loads its skills and completes them as the person types '/'. Decided 2026-11-12" }
  - { id: S6, kind: decision, said: "the chat has a create-workflow and a create-plugin tab: the person talks to the agent specifically to build one. Decided 2026-11-12" }
  - { id: S7, kind: decision, said: "a project with no workflow shows this chat in the middle of the window, on the create-workflow tab. Decided 2026-11-12" }
  - { id: S8, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "mod+k opens an ask about the selection; an ask writes nothing; an ask about a record runs in that record's worktree; asks are kept one file per conversation" }
  - { id: S9, kind: reference, ref: "plans/an-action-acts.md", said: "an action turn asks its harness to write under its configured writing mode, and is recorded as chat.action" }
  - { id: S10, kind: code, ref: "packages/ui/frame.yaml", said: "the frame is closed and hash-locked: regions, actions, keys and slots are declared there; the palette opened by mod+k holds the ask" }
  - { id: S11, kind: reference, ref: "docs/design/a-skill-is-asked-for-in-the-chat.md", said: "the skills the chat may run are the skills ladder under the step chat, installed in ~/.amy/skills" }
  - { id: S12, kind: code, ref: "packages/cli/skills/amy-workflow/SKILL.md", said: "amy ships a skill that designs a workflow by asking one question at a time; none for a plugin" }
  - { id: S13, kind: reference, ref: "docs/guides/write-a-plugin.md", said: "how a plugin is written, contributed and installed, the material a plugin skill reads" }
  - { id: S14, kind: decision, said: "the button and mod+k open one chat: the same conversations, files and harness choice as the ask. Proposed 2026-11-12" }
  - { id: S15, kind: decision, said: "an action about a selected record runs in its worktree holding that record's lease, so it never races a step. Proposed 2026-11-12" }
  - { id: S16, kind: decision, said: "the question mark's list is generated from the frame's actions and keys and the chat's commands, never written by hand. Proposed 2026-11-12" }
  - { id: S17, kind: decision, said: "the create tabs are action turns with amy-workflow or a new amy-plugin skill lent; each ends on amy workflow check or the plugin's own tests. Proposed 2026-11-12" }
touches:
  - packages/ui/frame.yaml
  - packages/ui/conformance/golden.json
  - packages/ui/src/frame/frame.ts
  - packages/ui/src/frame/keymap.ts
  - packages/ui/src/help.ts
  - packages/ui/src/slash.ts
  - packages/ui/tests/frame.test.ts
  - packages/ui/tests/help.property.test.ts
  - packages/ui/tests/slash.test.ts
  - packages/ui-conformance/src/world.ts
  - packages/ui-conformance/src/script.ts
  - packages/ui-conformance/tests/conformance.test.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/config.test.ts
  - packages/cli/skills/amy-plugin/SKILL.md
  - docs/guides/the-chat.md
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "the frame declares a dock at the bottom right holding help and chat, with their actions and keys, and every renderer draws it there", proof: "deferred:assertion:frame.every_region_sits_where_declared", sources: [S1, S10] }
  - { id: A2, statement: "for any frame, the help lists every declared action with its key and every chat command, and nothing else", proof: "deferred:property:packages/ui/tests/help.property.test.ts#an_action_missing_from_help", sources: [S1, S16] }
  - { id: A3, statement: "the chat opens in the saved mode, plan when none is saved; plan turns run read-only whatever the saved mode", proof: "deferred:test:packages/cli/tests/config.test.ts", sources: [S2, S3, S9] }
  - { id: A4, statement: "'open in this mode' in the mode menu and the terminal command both write chat.mode, and the next chat opens in it", proof: "deferred:assertion:window.the_chat_opens_in_its_saved_mode", sources: [S3, S4] }
  - { id: A5, statement: "typing '/' offers new, harness, action and plan, then each skill the chat ladder names, filtered by what follows", proof: "deferred:test:packages/ui/tests/slash.test.ts", sources: [S5, S11] }
  - { id: A6, statement: "the button and mod+k open the same conversation: a turn written from one is in the other", proof: "deferred:assertion:window.one_chat_two_doors", sources: [S8, S14] }
  - { id: A7, statement: "an action about a selected record runs in its worktree after taking its lease, and waits while a step holds it", proof: "deferred:assertion:window.an_action_waits_for_the_step", sources: [S8, S15] }
  - { id: A8, statement: "on the fakes, a plan turn asking to edit changes nothing; switched to action, it edits and records chat.action; the next plan turn reads the edit", proof: "deferred:assertion:window.plan_then_action", sources: [S2, S9] }
  - { id: A9, statement: "the create-workflow tab lends amy-workflow and ends with amy workflow check green on the fakes; create-plugin lends amy-plugin and ends with the plugin's tests green", proof: "deferred:assertion:window.a_tab_builds_what_it_names", sources: [S6, S12, S13, S17] }
  - { id: A10, statement: "with no workflow mounted, the window opens on the chat in the middle, on the create-workflow tab", proof: "deferred:assertion:window.an_empty_project_opens_on_the_chat", sources: [S7] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A2" }
  - { mechanism: config, answer: works, proof: "deferred:A3" }
  - { mechanism: checkouts-and-leases, answer: works, proof: "deferred:A7" }
guarantee:
  - { holds: "the chat never writes in plan mode, whatever mode is saved", not_against: "an action turn, which writes by design (S9)" }
  - { holds: "an action about a record never runs while a step holds its checkout", not_against: "a person editing the checkout by hand" }
failures:
  - { step: chat, when: "chat.mode names a mode that does not exist", goes_to: "refused at boot by name, listing plan and action" }
  - { step: create tab, when: "the skill it lends is not installed", goes_to: "the tab names the skill and amy skills, and nothing runs" }
cut:
  - "holding the action button as the only way to save the mode (S4)"
  - "where the dock and the empty state sit beside the rest of the new frame: the window's own rows"
exit: "a person opens the chat from its button, asks in plan mode, switches to action and the file changes, saves action as the mode, reopens in action, and types '/' to pick amy-groom"
---
# The chat is one button away

The chat lives behind mod+k today, read-only and with no list of what can be typed. This plan adds two floating buttons, help and chat, and gives the chat a plan or action mode, '/' completion and tabs that build a workflow or a plugin.
