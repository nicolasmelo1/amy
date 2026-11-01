---
sources:
  - { id: S1, kind: reference, ref: "plans/amy-has-a-window.md", said: "the window draws in a desktop app; a person living in a terminal should not leave it to see their work, and with views as data a terminal costs one renderer, not a second window" }
  - { id: S2, kind: reference, ref: "plans/a-renderer-is-chosen-by-name.md", said: "@amykit/ui-ink contributes the renderer named terminal, declaring the surfaces it draws: amy ui terminal opens it, and amy ui does once ui.default says so" }
  - { id: S3, kind: reference, ref: "plans/the-window-is-served.md", said: "it is a client like the desktop app, able to follow a server on another machine, and draws with Ink, the React renderer for the command line" }
  - { id: S4, kind: decision, said: "the frame is the same: nav 1 as a row of sections, nav 2 as a list, the canvas, and the right panel toggled by a key; ⌘K is the same ask" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "every primitive has a terminal drawing: Diff a coloured unified diff, Timeline a list, StateMachine the workflow's diagram, drawn from the states and edges the server parsed, never from Mermaid text" }
  - { id: S6, kind: decision, said: "in a record's canvas the diagram is the strip, one line with the current state marked; in the Workflows canvas, each state with its labelled edges beneath, anywhere and returns states said in words" }
  - { id: S7, kind: decision, said: "a diagram is edited on a copy, as the editor opener works: $EDITOR opens a temporary file with the diagram and its revision; on exit the window submits it through saveWorkflowDiagram, the desktop canvas's checked save" }
  - { id: S8, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "the terminal answers the frame's modal keymap: j/k through a list, h/l between nav 2, canvas and panel, gg/G, / to search, : for a command, counts, sequences and a leader key" }
  - { id: S9, kind: decision, said: "keys are remappable in ui.keys with Neovim's own key notation, the remap shared with the desktop app because it is the frame's, not this renderer's" }
  - { id: S10, kind: friction, said: "a window making terminal people reach for arrow keys is one they close; the one operator who asked named herdr as the feel: keyboard-first, still answering the mouse" }
  - { id: S11, kind: decision, said: "Ink has no mouse, so the renderer turns on SGR mouse reporting (modes 1000/1006) when it starts, off when it exits or suspends, translating clicks and the wheel into the frame actions keys reach" }
  - { id: S12, kind: decision, said: "a click on a row opens it, on a tab selects it, on the panel's edge toggles it; the wheel scrolls the list or canvas; a terminal reporting no mouse leaves the keys exactly as they were" }
  - { id: S13, kind: reference, ref: "plans/the-workplace-opens-where-you-work.md", said: "the terminal half of its opener: the window suspends, the person's $EDITOR or a shell runs in the record's checkout, and the window comes back on the same record when it exits" }
  - { id: S14, kind: decision, said: "the renderer only translates primitives, holding no view, snapshot or rule the desktop renderer does not, so the two cannot disagree about what a record says" }
  - { id: S15, kind: decision, said: "as the second real renderer, plugins/ui-ink/src/** joins ui-frame's activation; the script runs on the installed Ink plugin at 120×40 by default keys, conformance remap and SGR mouse input, comparing desktop and terminal projections every step" }
touches:
  - plugins/ui-ink/**
  - packages/ui-conformance/src/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "the terminal renderer holds the frame on every step of the script", proof: "deferred:assertion:frame.every_region_sits_where_declared", sources: [S1, S4, S15] }
  - { id: A2, statement: "the terminal and desktop renderers agree on every region, on every step", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S3, S14, S15] }
  - { id: A3, statement: "every primitive in the vocabulary has a terminal drawing, and a new one without it fails the build", proof: "deferred:test:plugins/ui-ink/tests/primitives.test.ts", sources: [S5, S6] }
  - { id: A4, statement: "a plugin's canvas tab appears in the terminal with no change to the plugin", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S14] }
  - { id: A5, statement: "the editor opener suspends the window, starts in the record's checkout, and returns to the same record when the editor exits", proof: "deferred:assertion:window.the_editor_returns_to_the_same_record", sources: [S13] }
  - { id: A6, statement: "a workflow's diagram edited in $EDITOR from the terminal is saved through the desktop canvas's check, and a refused or stale one leaves workflow.mmd unchanged", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S7] }
  - { id: A7, statement: "a plugin installed from outside the workspace lands in the same place in the terminal as in the desktop app", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S14] }
  - { id: A8, statement: "the default keys, the conformance remap and the mouse drive the terminal to the same projections, step for step", proof: "deferred:assertion:frame.keys_remaps_and_the_mouse_agree", sources: [S9, S10, S11, S12, S15] }
  - { id: A9, statement: "counts and sequences work as in Neovim: 5j moves five rows, gg goes to the first", proof: "deferred:test:plugins/ui-ink/tests/keymap.test.ts", sources: [S8] }
  - { id: A10, statement: "mouse reporting is on while the window runs, and off after it exits or suspends for an editor", proof: "deferred:test:plugins/ui-ink/tests/mouse.test.ts", sources: [S11] }
  - { id: A11, statement: "a terminal that reports no mouse still answers every key", proof: "deferred:test:plugins/ui-ink/tests/mouse.test.ts", sources: [S12] }
  - { id: A12, statement: "the terminal draws no menu bar, as its contribution declares", proof: "deferred:assertion:frame.a_surface_is_drawn_only_where_declared", sources: [S2] }
  - { id: A13, statement: "the narrowest width the frame allows still draws every region", proof: "deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width", sources: [S4, S15] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A2, A8" }
failures:
  - { step: diagram edit in $EDITOR, when: "saveWorkflowDiagram refuses the copy or finds it stale", goes_to: "workflow.mmd stays exactly as it was; the copy stays to be edited again" }
  - { step: mouse reporting, when: "the terminal reports no mouse", goes_to: "the keys work exactly as they were" }
cut:
  - "a graph layout in characters (beautiful-mermaid box art): refused; it brings elkjs, 7.7 MB, runs sixty lines for seven states and merges two opposite edges; wanted, it is a plugin's canvas tab"
exit: "a person runs amy ui terminal, follows a record to ESCALATED, discusses it in the right panel, decides, and opens its checkout in nvim, never touching the arrow keys, clicking where quicker, and every step's projection is the desktop app's"
---
# The window fits a terminal

A person who lives in a terminal should not have to leave it to see their work, and should not have to reach for the arrow keys once there. With views as data, that costs one renderer, not a second window.
