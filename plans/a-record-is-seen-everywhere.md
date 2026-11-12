---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: reference, ref: "plans/the-work-is-listed-everywhere.md", said: "the breadcrumb chooses a record; this slice draws it: its workflow's nodes with where it is, and the sidebar that opens on a node" }
  - { id: S2, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a record's diagram is its workflow.mmd with the current state marked" }
  - { id: S3, kind: decision, said: "with a record chosen, the canvas is its workflow's states as nodes joined by the diagram's edges; each node's header is its state, the current one marked, the ones it passed through marked passed. Decided 2026-11-12" }
  - { id: S4, kind: decision, said: "choosing a node opens the sidebar on that state's view for this record: implementing shows the branch, the changed files as a tree and the diff; an escalation shows a chat. Decided 2026-11-12" }
  - { id: S5, kind: decision, said: "a state the record has left shows what it did there, rebuilt from the record and the log when chosen, never from a stored copy of the view. Decided 2026-11-12" }
  - { id: S6, kind: decision, said: "a visit is one entry into a state until the next transition; the sidebar of a past visit reads only the record's events between those two instants. Proposed 2026-11-12" }
  - { id: S7, kind: decision, said: "a transition records the checkout's head when the workflow holds one, so a past visit's diff is the two heads around it, not today's branch. Proposed 2026-11-12" }
  - { id: S8, kind: decision, said: "the diff in the sidebar is a summary of files and line counts, each file a link opening it in the person's editor; amy draws no full diff of its own. Decided 2026-11-12" }
  - { id: S9, kind: reference, ref: "plans/the-workplace-opens-where-you-work.md", said: "openers take a person from a record to their editor and terminal; a link is an opener's address" }
  - { id: S10, kind: decision, said: "a node's ⋯ acts on that record and nothing wider, through an existing command: poke; the terminal reaches it by the leader key" }
  - { id: S11, kind: decision, said: "no renderer writes anything the CLI cannot: every intent resolves to a function a command already calls, so none is a second road to the tracker" }
  - { id: S12, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "the escalation's chat is the work's thread, and a decision happens there, beside the discussion it settles" }
  - { id: S13, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "a plugin fills a node's body and a state's sidebar by name; this slice ships the defaults they replace" }
  - { id: S14, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers view work.log { profile?, workId? }, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - packages/core/src/work.ts
  - packages/core/tests/work.test.ts
  - packages/services/surface.yaml
  - packages/services/src/domains/work.ts
  - packages/services/tests/surface.test.ts
  - packages/services/tests/visits.property.test.ts
  - plugins/ui-webview/src/canvas.tsx
  - plugins/ui-webview/src/sidebar.tsx
  - plugins/ui-ink/src/canvas.tsx
  - plugins/ui-ink/src/sidebar.tsx
  - packages/cli/tests/ui-actions.test.ts
  - packages/ui-conformance/src/script.ts
  - packages/ui-conformance/src/world.ts
  - plugins/ui-webview/package.json
  - plugins/ui-ink/package.json
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S14] }
  - { id: A2, statement: "a record's canvas draws one node per state its diagram declares, joined by every edge the file draws, with the current state marked and the visited ones marked passed, in the app and the terminal", proof: "deferred:assertion:window.the_nodes_are_the_diagram", sources: [S1, S2, S3] }
  - { id: A3, statement: "choosing the current node opens its state's view; for a state with a checkout, the branch, the changed files as a tree and their line counts", proof: "deferred:assertion:window.the_sidebar_follows_the_node", sources: [S4, S12, S13] }
  - { id: A4, statement: "for any history and log, a past visit's sidebar reads exactly the record's events between its entry and the next transition", proof: "deferred:property:packages/services/tests/visits.property.test.ts#a_visit_reads_the_next_ones_events", sources: [S5, S6] }
  - { id: A5, statement: "a past visit's diff is between the heads recorded at its entry and exit; a record saved before heads were recorded says it has none", proof: "deferred:test:packages/core/tests/work.test.ts", sources: [S7] }
  - { id: A6, statement: "every file in the diff summary is a link its opener resolves, and no renderer draws a file's full diff", proof: "deferred:assertion:window.a_diff_opens_in_the_editor", sources: [S8, S9] }
  - { id: A7, statement: "a node's ⋯, from the app or the terminal's leader key, leaves the same record, queue and log a run of its command leaves, and offers nothing wider than the record", proof: "deferred:test:packages/cli/tests/ui-actions.test.ts", sources: [S10, S11] }
  - { id: A8, statement: "the fake tracker's and forge's call logs hold no write any renderer made", proof: "deferred:assertion:window.the_window_writes_nothing_the_cli_cannot", sources: [S11] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A5; a transition gains an optional head, and a record without one reads as before" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "recording a head on a transition charges and gives back nothing" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A7" }
guarantee:
  - { holds: "a past visit shows what the log and the record say happened in it", not_against: "a log pruned past that visit, which the sidebar says it cannot show" }
  - { holds: "an action from any renderer leaves exactly what its command leaves", not_against: "two people acting on one record from two renderers at once; the queue orders them" }
failures:
  - { step: sidebar, when: "the checkout of a past visit is gone", goes_to: "the summary is drawn from the recorded heads through the forge when it can, else says the checkout is gone" }
cut:
  - "a stored snapshot of each state's view: refused; a visit is rebuilt from the record and the log (S5)"
  - "a full diff drawn by amy: refused; the editor shows it (S8)"
  - "retiring one record from the window: waits for work-that-is-over-goes-away"
exit: "TBO-1 chosen in the app and the terminal marks IMPLEMENTING current and READY passed; READY shows that visit's log only, IMPLEMENTING its branch and files opening in the editor; poked from the terminal it moves in the app"
---
# A record is seen everywhere

The second slice: one record, chosen. Its workflow as nodes with where it is,
and a sidebar that becomes the chosen state's view, rebuilt from the log for a
state already left.
