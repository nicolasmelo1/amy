---
base: bf221baf76d544453b7538861967a258cf962222
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
  - { id: S15, kind: reference, ref: "https://joydle.github.io/borg/", said: "a run view: each node with its tokens and a badge (restored, approved), a span waterfall under the graph, a budget, elapsed and checkpoints panel, and one line: Done in 20.47s: 8 steps, 2 checkpoints" }
  - { id: S16, kind: decision, said: "that run view is what the record view should borrow from. Decided 2026-11-12" }
  - { id: S17, kind: decision, said: "each node shows the tokens and cost of this record's runs in that state, and one badge for what happened there: retry n, attention entered, a call's end, budget-parked, rate-limited. Proposed 2026-11-12" }
  - { id: S18, kind: decision, said: "under the canvas a waterfall: one bar per visit, as long as it lasted, marked where it waited, failed, was parked or ran an agent. Proposed 2026-11-12" }
  - { id: S19, kind: decision, said: "a side panel: this record's tokens and cost, elapsed since its first event, and attempts per state. Proposed 2026-11-12" }
  - { id: S20, kind: decision, said: "one summary line per record (moves, entries into each attention state, each call's ends by name, elapsed, cost), read the same in the view, its notification and the menu bar. Proposed 2026-11-12" }
  - { id: S21, kind: code, ref: "packages/core/events.json", said: "agent.run carries workId, state, outcome, tokens and costUsd; work.advanced, work.waiting, work.failed and budget.parked carry workId and state" }
  - { id: S22, kind: code, ref: "packages/ui/src/vocabulary.ts", symbol: "Timeline", said: "a Timeline entry is a point { at, label }: nothing in the vocabulary draws a duration" }
  - { id: S23, kind: reference, ref: "plans/what-needs-you-is-counted-everywhere.md", said: "a workflow's diagram marks its attention states, the ones that wait on the person" }
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
  - packages/ui/src/vocabulary.ts
  - packages/ui/tests/vocabulary.test.ts
  - packages/services/src/domains/record-summary.ts
  - packages/services/tests/record-summary.property.test.ts
  - plugins/ui-webview/src/timeline.tsx
  - plugins/ui-ink/src/timeline.tsx
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S14] }
  - { id: A2, statement: "a record's canvas draws one node per state its diagram declares, joined by every edge the file draws, with the current state marked and the visited ones marked passed, in the app and the terminal", proof: "deferred:assertion:window.the_nodes_are_the_diagram", sources: [S1, S2, S3] }
  - { id: A3, statement: "choosing the current node opens its state's view; for a state with a checkout, the branch, the changed files as a tree and their line counts", proof: "deferred:assertion:window.the_sidebar_follows_the_node", sources: [S4, S12, S13] }
  - { id: A4, statement: "for any history and log, a past visit's sidebar reads exactly the record's events between its entry and the next transition", proof: "deferred:property:packages/services/tests/visits.property.test.ts#a_visit_reads_the_next_ones_events", sources: [S5, S6] }
  - { id: A5, statement: "a past visit's diff is between the heads recorded at its entry and exit; a record saved before heads were recorded says it has none", proof: "deferred:test:packages/core/tests/work.test.ts", sources: [S7] }
  - { id: A6, statement: "every file in the diff summary is a link its opener resolves, and no renderer draws a file's full diff", proof: "deferred:assertion:window.a_diff_opens_in_the_editor", sources: [S8, S9] }
  - { id: A7, statement: "a node's ⋯, from the app or the terminal's leader key, leaves the same record, queue and log a run of its command leaves, and offers nothing wider than the record", proof: "deferred:test:packages/cli/tests/ui-actions.test.ts", sources: [S10, S11] }
  - { id: A8, statement: "the fake tracker's and forge's call logs hold no write any renderer made", proof: "deferred:assertion:window.the_window_writes_nothing_the_cli_cannot", sources: [S11] }
  - { id: A9, statement: "each node shows the tokens and cost of the agent.run events for this record and state, and one badge for the latest of: retry n, attention entered, a call's end, budget-parked, rate-limited", proof: "deferred:assertion:window.a_node_says_what_happened_there", sources: [S15, S16, S17, S21, S23] }
  - { id: A10, statement: "for any record and log, the badges, costs, timeline bars and summary line are a function of that record's events alone; another record's event changes none of them", proof: "deferred:property:packages/services/tests/record-summary.property.test.ts#another_records_event_counts", sources: [S17, S18, S20, S21] }
  - { id: A11, statement: "the timeline has one bar per visit, as long as the visit, the current one running to now, each wait, failure, park and agent run marked inside the visit it happened in", proof: "deferred:property:packages/services/tests/visits.property.test.ts#a_mark_lands_in_the_wrong_visit", sources: [S6, S18] }
  - { id: A12, statement: "a Timeline entry may carry an optional until; one ending before its at is refused naming it, and a surface that draws no bar writes the duration as text", proof: "deferred:test:packages/ui/tests/vocabulary.test.ts", sources: [S22] }
  - { id: A13, statement: "the side panel shows this record's tokens, its cost only when every run was priced, elapsed since its first event and attempts per state, matching its golden on every surface", proof: "deferred:assertion:window.the_record_panel_matches_its_golden", sources: [S19, S21] }
  - { id: A14, statement: "the summary line names moves, entries into each attention state, each call's ends by name, elapsed and cost, leaving out every zero, and matches its golden on every surface", proof: "deferred:assertion:window.the_summary_line_is_one_string", sources: [S20, S23] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A5; a transition gains an optional head, and a record without one reads as before" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "recording a head on a transition charges and gives back nothing" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3, A12" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A7" }
guarantee:
  - { holds: "a past visit shows what the log and the record say happened in it", not_against: "a log pruned past that visit, which the sidebar says it cannot show" }
  - { holds: "an action from any renderer leaves exactly what its command leaves", not_against: "two people acting on one record from two renderers at once; the queue orders them" }
  - { holds: "badges, costs, the timeline and the summary say only what the record and the log hold", not_against: "a log pruned past the record's first event, after which they say from when they count" }
failures:
  - { step: sidebar, when: "the checkout of a past visit is gone", goes_to: "the summary is drawn from the recorded heads through the forge when it can, else says the checkout is gone" }
cut:
  - "an estimated cost for an unpriced run: tokens are shown, a cost only when every run was priced"
  - "Borg's checkpoint and restore badges: amy saves the record on every move, so there is nothing to restore"
  - "a stored snapshot of each state's view: refused; a visit is rebuilt from the record and the log (S5)"
  - "a full diff drawn by amy: refused; the editor shows it (S8)"
  - "retiring one record from the window: waits for work-that-is-over-goes-away"
exit: "TBO-1 chosen in app and terminal: READY passed shows its visit's log, IMPLEMENTING its files opening in the editor, its tokens and retry badge; a bar per visit and one summary line; poked from the terminal, it moves"
---
# A record is seen everywhere

The second slice: one record, chosen. Its workflow as nodes with where it is,
and a sidebar that becomes the chosen state's view, rebuilt from the log for a
state already left.
