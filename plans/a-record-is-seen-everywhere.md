---
sources:
  - { id: S1, kind: reference, ref: "plans/the-work-is-listed-everywhere.md", said: "the work is listed in the app, the terminal and the menu bar; this slice opens one record in all three" }
  - { id: S2, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a record's canvas: the strip is its workflow.mmd with the current state marked, and a timeline joining its history to events mentioning it" }
  - { id: S3, kind: decision, said: "in the terminal the strip is one line with the current state marked; in the app it is the diagram drawn with every edge the file draws" }
  - { id: S4, kind: decision, said: "the right panel, opened and closed by the person, is the log filtered to the selected record, or the work thread when the record waits on its owner" }
  - { id: S5, kind: decision, said: "a ⋯ acts on its own row and nothing wider, through an existing command: a record's offers poke; the menu bar's submenu for a record holds the same actions, and the terminal reaches them by the leader key" }
  - { id: S6, kind: decision, said: "the handbrake (pause, resume) stops every workflow at once, so it is on no record's row" }
  - { id: S7, kind: reference, ref: "plans/work-that-is-over-goes-away.md", said: "retiring one record waits for this plan, which adds the command" }
  - { id: S8, kind: decision, said: "no renderer writes anything the CLI cannot: every intent resolves to a function a command already calls, so none is a second road to the tracker" }
  - { id: S9, kind: decision, said: "choosing a record in the menu bar opens the window on it, so the menu bar is never a road the window is not" }
  - { id: S10, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "deciding is not a menu action: a decision happens in the thread, beside the discussion it settles" }
  - { id: S11, kind: reference, ref: "plans/the-workplace-opens-where-you-work.md", said: "the terminal half of its opener: the terminal renderer suspends, the person's $EDITOR or a shell runs in the record's checkout, and it comes back on the same record when it exits" }
  - { id: S12, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers view work.log { profile?, workId? } in the panel, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - plugins/ui-desktop/**
  - plugins/ui-webview/**
  - plugins/ui-ink/**
  - packages/server/surface.yaml
  - packages/server/src/**
  - packages/server/tests/surface.test.ts
  - packages/cli/src/ui/**
  - packages/cli/tests/ui-actions.test.ts
  - packages/ui/**
  - packages/ui-conformance/src/**
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S12] }
  - { id: A2, statement: "the strip in a record's canvas is its workflow's diagram, with every edge the file draws and the record's state marked, in the app and as one line in the terminal", proof: "deferred:assertion:window.the_strip_is_the_diagram", sources: [S1, S2, S3] }
  - { id: A3, statement: "the right panel shows the record's log, or its thread when it waits on its owner, in the app and the terminal alike", proof: "deferred:assertion:window.the_panel_follows_the_record", sources: [S4] }
  - { id: A4, statement: "every ⋯ action, from a row, the menu bar's submenu or the terminal's leader key, leaves the same record, queue and log a run of its command leaves", proof: "deferred:assertion:window.an_action_is_its_command", sources: [S5, S8] }
  - { id: A5, statement: "no row's ⋯ offers an action wider than its row: no record row pauses the machine or retires a record", proof: "deferred:test:packages/cli/tests/ui-actions.test.ts", sources: [S5, S6, S7] }
  - { id: A6, statement: "the fake tracker's and forge's call logs hold no write any renderer made", proof: "deferred:assertion:window.the_window_writes_nothing_the_cli_cannot", sources: [S8] }
  - { id: A7, statement: "choosing a record in the menu bar opens the window on it, and its submenu offers its row's ⋯ actions and no decision", proof: "deferred:assertion:window.the_menu_bar_is_no_other_road", sources: [S9, S10] }
  - { id: A8, statement: "the editor opener suspends the terminal renderer, starts in the record's checkout, and returns to the same record when the editor exits", proof: "deferred:assertion:window.the_editor_returns_to_the_same_record", sources: [S11] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A4" }
  - { mechanism: install-and-update, answer: n/a, why: "a record's row offers poke alone; removing a workflow is the workflows slice's" }
guarantee:
  - { holds: "an action from any renderer leaves exactly what its command leaves", not_against: "two people acting on one record from two renderers at once; the queue orders them as it orders two commands" }
  - { holds: "the terminal returns to the same record when $EDITOR exits", not_against: "an $EDITOR returning before the edit ends, such as code without --wait" }
cut:
  - "retiring one record from the window: waits for work-that-is-over-goes-away (S7)"
  - "deciding from the menu bar: refused; a decision happens in the thread (S10)"
exit: "one record opened from the app, the terminal and the menu bar shows the same strip and log; poked from the terminal's leader key it moves in the app; its checkout opens in nvim from the terminal and comes back"
---
# A record is seen everywhere

The second slice: one record, opened. Its diagram with where it is, its history, its log and what can be done to it look the same whether it was opened from the app, the terminal or the menu bar, and every action is a command that already exists.
