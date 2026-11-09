---
sources:
  - { id: S1, kind: friction, said: "mostly a person wants, at a glance, whether anything needs them and whether work moves, like a build monitor in the menu bar; opening a terminal or window to learn nothing needs them is the interruption" }
  - { id: S2, kind: reference, ref: "plans/the-work-is-listed-everywhere.md", said: "the menu bar item, the desktop app and the terminal exist and list the work; this slice says, on all three, which of it needs the person" }
  - { id: S3, kind: decision, said: "the menu bar's title says what needs the person, nothing else: the count of records in an attention state, a mark while any record is worked; no count is no number" }
  - { id: S4, kind: code, ref: "packages/cli/src/status-view.ts", said: "the core knows a state only as waiting or terminal (standing), so ESCALATED and HUMAN_REVIEW look alike, though one waits on its owner and the other on somebody else" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a workflow may mark states attention in its diagram (class ESCALATED attention), read by the subset reading waiting; the host reads them as attentionStates, states waiting on the work's owner" }
  - { id: S6, kind: decision, said: "a raw Workflow may declare attentionStates by hand; optional either way, so every workflow so far mounts unchanged with none; ticket-to-qa's diagram marks CLARIFYING and ESCALATED" }
  - { id: S7, kind: reference, ref: "plans/looks-are-configuration.md", said: "every record has one of four standings (attention, active, waiting, finished), counted by the menu bar, drawn by the window and the terminal, coloured later by looks-are-configuration" }
  - { id: S8, kind: decision, said: "the menu groups need-you records first, with state, workflow, open and poke, then working records with cost so far; the work list in the app and the terminal puts the same records first with the same standing" }
  - { id: S9, kind: decision, said: "the menu is a view recomputed when the event log says something changed, window open or not; entering an attention state raises a system notification, configurable, on by default, opening the window on that record" }
  - { id: S10, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "a native menu cannot draw what a canvas can, so the menubar surface holds a closed subset: Text, Badge, List, Link, Button; after every script step the harness compares the app's menu title and item tree with the golden" }
  - { id: S11, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers no operation: view menubar.title over the session stream, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - plugins/ui-desktop/**
  - plugins/ui-webview/**
  - plugins/ui-ink/**
  - packages/ui/frame.yaml
  - packages/ui/src/**
  - packages/ui-conformance/src/**
  - packages/core/src/diagram.ts
  - packages/core/src/plugin.ts
  - packages/cli/src/status-view.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - packages/ui/tests/surfaces.test.ts
  - packages/core/tests/mount.test.ts
  - packages/core/tests/diagram.test.ts
  - packages/core/tests/diagram.property.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S11] }
  - { id: A2, statement: "the menu bar's projection holds the frame's menubar surface on every step of the script, and a primitive outside its subset is refused naming it", proof: "deferred:assertion:frame.the_menu_bar_holds_its_surface", sources: [S10] }
  - { id: A3, statement: "a workflow whose diagram marks no state attention mounts unchanged", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S6] }
  - { id: A4, statement: "a state marked attention in a diagram mounts as an attention state", proof: "deferred:property:packages/core/tests/diagram.property.test.ts#only_first_state_of_a_class_line_marked", sources: [S4, S5] }
  - { id: A5, statement: "the menu bar's title counts exactly the records in an attention state, across every profile, and the app and the terminal list those same records first, marked attention", proof: "deferred:assertion:window.what_needs_you_is_the_same_everywhere", sources: [S1, S2, S3, S7, S8] }
  - { id: A6, statement: "a record the daemon advances into attention moves in the menu with the window closed", proof: "deferred:assertion:window.the_menu_bar_moves_without_the_window", sources: [S9] }
  - { id: A7, statement: "a record entering an attention state raises one notification, opening the window on it, and none when notifications are off", proof: "deferred:assertion:window.attention_is_notified_once", sources: [S9] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A3, A4" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A3" }
  - { mechanism: status, answer: works, proof: "deferred:A5" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2" }
  - { mechanism: hooks, answer: n/a, why: "attentionStates is a declared field, not a hook; before, after and interrupt are unchanged" }
  - { mechanism: calls, answer: n/a, why: "only an optional attentionStates field is added; how workflows call one another is unchanged" }
  - { mechanism: record-migration, answer: n/a, why: "a diagram gains a class line; no record shape changes, and a record's standing is derived, not stored" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A7" }
guarantee:
  - { holds: "the title counts exactly the records in an attention state, or says it cannot see", not_against: "a record that entered and left attention while the server was unreachable" }
  - { holds: "one notification per entry into an attention state, none when notifications are off", not_against: "macOS Focus or Do Not Disturb holding it back; a record leaving and re-entering attention is a new entry" }
  - { holds: "the menu moves with the window closed while the app runs", not_against: "an app quit or not yet started at login: nothing is counted or notified then" }
cut:
  - "a count in the terminal's own title bar or tmux status line: later, once somebody asks; the terminal lists attention first like the app"
exit: "window closed, a ticket escalates: the menu bar count goes 0 to 1, one notification arrives, the terminal lists it first as attention, the notification opens the window on it, and every menu bar step matches the golden"
---
# What needs you is counted everywhere

Most of the time a person does not want amy's window, only to know at a glance whether anything needs them. This slice gives a workflow a way to say which states wait on the person, and shows that the same way in the menu bar, the app and the terminal.
