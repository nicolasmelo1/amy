---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: reference, ref: "plans/a-record-is-seen-everywhere.md", said: "a chosen record is its workflow's nodes with where it is; this slice draws the workflow chosen with no record, and Settings" }
  - { id: S2, kind: decision, said: "choosing only the workflow in the breadcrumb shows the workflow alone, as if to configure it: its states as nodes, no record's data on them. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "in that view each node shows its state's standing data: the records in it now, its last log entries summarised, and its runs by model with their cost; the diagram's edges join the nodes" }
  - { id: S4, kind: reference, ref: "plans/a-workflow-learns-from-its-mistakes.md", said: "amy budget breaks spend down by step and model, from the agent.run events alone" }
  - { id: S5, kind: friction, said: "one install's 715 agent.run events: SELF_REVIEW on Opus was 73% of the spend, 0.71 US$ a run against 0.21 for IMPLEMENTING on Sonnet, and 524 triage runs were abandoned in about 2 ms; nothing showed either" }
  - { id: S6, kind: decision, said: "a workflow under ~/.amy/workflows is edited as text: saving reads it with the host's subset, writes the file, and shows the check's drawn-not-walked list; a refused diagram is not saved, the refusal naming the line" }
  - { id: S7, kind: decision, said: "a workflow installed as a package is shown, not edited; one with no diagram shows its declared states and says it has none" }
  - { id: S8, kind: decision, said: "in the terminal a diagram is edited on a copy: $EDITOR opens a temporary file with the diagram and its revision, and on exit it goes through saveWorkflowDiagram, the checked save the app uses" }
  - { id: S9, kind: decision, said: "the Workflow dropdown's ⋯ on a workflow offers remove <name>, with amy remove's refusal when the machine would not survive it" }
  - { id: S10, kind: decision, said: "the handbrake (pause, resume) stops every workflow, so it is on no node: it is in the workflow view, saying what it stops, and in the menu bar as Pause all, whose title says when it is pulled" }
  - { id: S11, kind: decision, said: "the settings icon opens config.yaml edited as text in the canvas; saving runs boot's assemble, and a config that would not mount is not saved, every refusal shown by name. Decided 2026-11-12" }
  - { id: S12, kind: decision, said: "a Settings save whose assemble fails other than by a mount() refusal (a plugin that will not import, a full disk) is an internal error, never a refusal, and the old file stays. Decided 2026-11-08" }
  - { id: S13, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "a plugin fills a node's body for the workflows and states it names, generically or for one node, within the node's size" }
  - { id: S14, kind: decision, said: "in the terminal a node is its state's name, its records and its cost by model as lines, with its labelled edges beneath; the app places nodes by the diagram's layout" }
  - { id: S15, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers domains machine, workflows, settings (getHandbrake, setHandbrake, removeWorkflow, getConfig, saveConfig, saveWorkflowDiagram) and views workflows.list, workflows.detail, workflows.handbrake, local-only settings.config" }
  - { id: S16, kind: decision, said: "Settings edits the general config.yaml, or the chosen workflow's own profiles/<name>/config.yaml (plans/a-profile-keeps-its-own-config.md); a save writes only the file shown. Decided 2026-11-13" }
touches:
  - packages/services/surface.yaml
  - packages/services/src/domains/workflows.ts
  - packages/services/src/domains/settings.ts
  - packages/services/tests/surface.test.ts
  - plugins/ui-webview/src/workflow.tsx
  - plugins/ui-webview/src/settings.tsx
  - plugins/ui-ink/src/workflow.tsx
  - plugins/ui-ink/src/settings.tsx
  - plugins/ui-menubar/src/menu.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-config.test.ts
  - packages/cli/tests/ui-actions.test.ts
  - packages/ui-conformance/src/script.ts
  - docs/design/a-workflow-is-a-mermaid-diagram.md
  - plugins/ui-webview/package.json
  - plugins/ui-ink/package.json
  - plugins/ui-menubar/package.json
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S15] }
  - { id: A2, statement: "a workflow chosen with no record draws one node per state its diagram declares, joined by its edges, carrying no record's state marks", proof: "deferred:assertion:window.a_workflow_alone_has_no_record", sources: [S1, S2] }
  - { id: A3, statement: "each of those nodes shows the records in that state and its last log entry, in the app by the diagram's layout and in the terminal as lines", proof: "deferred:assertion:window.every_state_is_a_node", sources: [S3, S14] }
  - { id: A4, statement: "a node counts runs and cost by model exactly as amy budget does for that step, in every renderer", proof: "deferred:assertion:window.a_node_counts_what_budget_counts", sources: [S3, S4, S5] }
  - { id: A5, statement: "a workflow's diagram edited in the app or in $EDITOR from the terminal is saved only when the subset reads it, and the save shows what is drawn and not walked", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S6, S8] }
  - { id: A6, statement: "a refused or stale diagram leaves workflow.mmd unchanged, and a package's diagram offers no edit", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S6, S7] }
  - { id: A7, statement: "a plugin's body for one state replaces only that node in every renderer, and removing the plugin brings the default body back", proof: "deferred:assertion:window.a_plugin_draws_a_node", sources: [S13] }
  - { id: A8, statement: "saving a config that would not mount keeps the old file and shows every refusal; one whose assemble throws for any other reason keeps it and shows an internal error", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S11, S12] }
  - { id: A9, statement: "removing a workflow from its dropdown leaves what amy remove leaves, and is refused as amy remove refuses", proof: "deferred:test:packages/cli/tests/ui-actions.test.ts", sources: [S9] }
  - { id: A10, statement: "pulling the handbrake from the workflow view or the menu bar stops every workflow, and the menu bar's title says it is paused", proof: "deferred:assertion:window.the_menu_bar_says_it_is_paused", sources: [S10] }
  - { id: A11, statement: "with a workflow chosen Settings opens and saves that profile's own config.yaml, with none the general one, and a save never writes the other file", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S16] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A8" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3, A7" }
  - { mechanism: diagram, answer: works, proof: "deferred:A5, A6" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A5, A6" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A9" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A9, A10" }
guarantee:
  - { holds: "a config.yaml or diagram saved over a newer revision is refused as stale, never overwritten", not_against: "the running daemon, which reads a saved config.yaml or diagram at its next start, not mid-run" }
  - { holds: "a save is refused only by what mount() refuses", not_against: "a plugin that draws its node wrongly, which only a person looking sees" }
failures:
  - { step: diagram edit in $EDITOR, when: "saveWorkflowDiagram refuses the copy or finds it stale", goes_to: "workflow.mmd stays exactly as it was; the copy stays to be edited again" }
cut:
  - "a form over Settings: later"
  - "a Workflows section in a nav: replaced by choosing the workflow in the breadcrumb (S2)"
exit: "shop › ticket-to-qa chosen alone shows its states as nodes with their records and cost by model; an added edge is listed drawn but not walked in the app and $EDITOR; a broken config.yaml from settings breaks nothing"
---
# The workflows are seen everywhere

The third slice: a workflow chosen with no record, seen as if to configure it.
Its states as nodes with what is in them and what they cost, its diagram
edited as text, the handbrake, and Settings behind the settings icon.
