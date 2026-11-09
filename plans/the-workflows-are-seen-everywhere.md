---
sources:
  - { id: S1, kind: reference, ref: "plans/a-record-is-seen-everywhere.md", said: "one record is seen in the app, the terminal and the menu bar; this slice does the same for the Workflows and Settings sections" }
  - { id: S2, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a workflow's canvas: its diagram beside its text" }
  - { id: S3, kind: decision, said: "a workflow under ~/.amy/workflows is edited as text: saving reads it with the host's subset, writes the file, and shows the check's drawn-not-walked list; a refused diagram is not saved, the refusal naming the line" }
  - { id: S4, kind: decision, said: "a workflow installed as a package is shown, not edited; one with no diagram shows its declared states and says it has none" }
  - { id: S5, kind: decision, said: "in the terminal a diagram is edited on a copy: $EDITOR opens a temporary file with the diagram and its revision, and on exit it goes through saveWorkflowDiagram, the checked save the app's canvas uses" }
  - { id: S6, kind: decision, said: "a workflow's row ⋯ offers remove <name>, with amy remove's refusal when the machine would not survive it" }
  - { id: S7, kind: decision, said: "the handbrake (pause, resume) stops every workflow, so it is on no row: it is in the Workflows canvas, saying what it stops, and in the menu bar as Pause all, whose title says when it is pulled" }
  - { id: S8, kind: decision, said: "Settings is config.yaml edited as text; saving runs boot's assemble, and a config that would not mount is not saved, every refusal shown by name as mount() reports them" }
  - { id: S9, kind: decision, said: "a Settings save whose assemble fails other than by a mount() refusal (a plugin that will not import, a full disk) is an internal error, never a refusal, and the old file stays. Decided 2026-11-08" }
  - { id: S10, kind: decision, said: "in a workflow's canvas each state is a card, not a box: the records in that state, its last log entries summarised, and its runs by model with their cost; the diagram's edges join the cards. Decided 2026-11-06" }
  - { id: S11, kind: decision, said: "a plugin contributes the card for a state, choosing what it reads (the last entry, the last ten summarised, a record's ticket), so a person composes the view that makes sense to them. Decided 2026-11-06" }
  - { id: S12, kind: reference, said: "a product page draws a process as cards joined by lines, each card showing that step's own live data: a booking, a message thread, a payout" }
  - { id: S13, kind: reference, ref: "plans/a-workflow-learns-from-its-mistakes.md", said: "amy budget breaks spend down by step and model, from the agent.run events alone" }
  - { id: S14, kind: friction, said: "one install's 715 agent.run events: SELF_REVIEW on Opus was 73% of the spend, 0.71 US$ a run against 0.21 for IMPLEMENTING on Sonnet, and 524 triage runs were abandoned in about 2 ms; nothing showed either" }
  - { id: S15, kind: decision, said: "one state's card, and one nav 1 section, has one contributing plugin: two are refused at mount naming both, and a card for a state the workflow lacks is refused naming plugin and state. Decided 2026-11-08" }
  - { id: S16, kind: decision, said: "in the terminal a state's card is the state's name, its records and its cost by model as lines, with its labelled edges beneath; the app places the cards by the diagram's layout" }
  - { id: S17, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers domains machine, workflows, settings (getHandbrake, setHandbrake, removeWorkflow, getConfig, saveConfig, saveWorkflowDiagram) and views workflows.list, workflows.detail, workflows.handbrake, local-only settings.config, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - plugins/ui-desktop/**
  - plugins/ui-webview/**
  - plugins/ui-ink/**
  - packages/server/surface.yaml
  - packages/server/src/**
  - packages/server/tests/surface.test.ts
  - packages/cli/src/ui/**
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-config.test.ts
  - packages/cli/tests/ui-actions.test.ts
  - packages/ui/**
  - packages/ui-conformance/src/**
  - docs/design/a-workflow-is-a-mermaid-diagram.md
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S17] }
  - { id: A2, statement: "a workflow's diagram edited in the app's canvas or in $EDITOR from the terminal is saved only when the subset reads it, and the save shows what is drawn and not walked", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S1, S2, S3, S5] }
  - { id: A10, statement: "a refused or stale diagram leaves workflow.mmd unchanged, and a package's diagram offers no edit", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S3, S4] }
  - { id: A3, statement: "a workflow's canvas draws one card per state its diagram declares, joined by its edges, each showing the records in that state and its last log entry, in the app by the diagram's layout and in the terminal as lines", proof: "deferred:assertion:window.every_state_is_a_card", sources: [S10, S12, S16] }
  - { id: A4, statement: "a state's card counts runs and cost by model exactly as amy budget does for that step, in every renderer", proof: "deferred:assertion:window.a_card_counts_what_budget_counts", sources: [S10, S13, S14] }
  - { id: A5, statement: "a plugin written outside this repository draws the card of one state, only that card changes in every renderer, and removing the plugin brings the default card back", proof: "deferred:assertion:window.a_plugin_draws_a_state", sources: [S11] }
  - { id: A6, statement: "two plugins contributing one state's card, or one nav 1 section, are refused at mount naming both; a card for a state the workflow does not declare is refused naming the plugin and the state", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S11, S15] }
  - { id: A7, statement: "saving a config that would not mount keeps the old file and shows every refusal; one whose assemble throws for any other reason keeps the old file and is shown as an internal error", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S8, S9] }
  - { id: A8, statement: "removing a workflow from its row leaves what amy remove leaves, and is refused as amy remove refuses", proof: "deferred:assertion:window.an_action_is_its_command", sources: [S6] }
  - { id: A9, statement: "pulling the handbrake from the Workflows canvas or the menu bar stops every workflow, and the menu bar's title says it is paused", proof: "deferred:assertion:window.the_menu_bar_says_it_is_paused", sources: [S7] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A7" }
  - { mechanism: rendering, answer: works, proof: "deferred:A3, A5, A6" }
  - { mechanism: diagram, answer: works, proof: "deferred:A2, A10" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A2, A10" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A8" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A8, A9" }
guarantee:
  - { holds: "a config.yaml or diagram saved over a newer revision is refused as stale, never overwritten", not_against: "the running daemon, which reads a saved config.yaml or diagram at its next start, not mid-run" }
  - { holds: "every card and nav 1 section has one owner, and a save is refused only by what mount() refuses", not_against: "a plugin that draws its card wrongly, which only a person looking sees" }
failures:
  - { step: diagram edit in $EDITOR, when: "saveWorkflowDiagram refuses the copy or finds it stale", goes_to: "workflow.mmd stays exactly as it was; the copy stays to be edited again" }
cut:
  - "a form over Settings: later"
exit: "a person's added edge is listed drawn but not walked in the app and in $EDITOR from the terminal alike; a broken config.yaml in Settings breaks nothing; the handbrake pulled from the menu bar puts paused in the title"
---
# The workflows are seen everywhere

The third slice: the Workflows and Settings sections. A workflow's states as cards with what is in them and what they cost, its diagram edited as text, and the handbrake, the same in the app, the terminal and the menu bar.
