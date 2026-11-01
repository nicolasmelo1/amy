---
sources:
  - { id: S1, kind: friction, said: "mostly a person wants, at a glance, whether anything needs them and whether work moves, like a build monitor in the menu bar; opening a terminal or window to learn nothing needs them is the interruption" }
  - { id: S2, kind: reference, ref: "plans/amy-has-a-window.md", said: "its desktop app stays resident and puts one menu bar item: the macOS menu bar first, the system tray on Windows and Linux when built for them" }
  - { id: S3, kind: decision, said: "the item's title says what needs the person, nothing else: the count of records in an attention state, a mark while any record is worked; no count is no number; a pulled handbrake is said instead" }
  - { id: S4, kind: code, ref: "packages/cli/src/status-view.ts", said: "the core knows a state only as waiting or terminal (standing), so ESCALATED and HUMAN_REVIEW look alike, though one waits on its owner and the other on somebody else" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a workflow may mark states attention in its diagram (class ESCALATED attention), read by the subset reading waiting; the host reads them as attentionStates, states waiting on the work's owner" }
  - { id: S6, kind: decision, said: "a raw Workflow may declare attentionStates by hand; optional either way, so every workflow so far mounts unchanged with none; ticket-to-qa's diagram marks CLARIFYING and ESCALATED" }
  - { id: S7, kind: reference, ref: "plans/looks-are-configuration.md", said: "every record has one of four standings (attention, active, waiting, finished), counted by the menu bar, drawn by the window, coloured later by looks-are-configuration" }
  - { id: S8, kind: decision, said: "the menu is the work grouped as the window: need-you records with state, workflow, open and poke; working records with cost so far; Paused and Pause all; Open amy; mod+k Ask" }
  - { id: S9, kind: decision, said: "choosing a record opens the window on it; a record's submenu holds its row's ⋯ actions, the same functions, so the menu bar is never a road the window is not" }
  - { id: S10, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "deciding is not a menu action: a decision happens in the thread, beside the discussion it settles" }
  - { id: S11, kind: decision, said: "the menu bar is a client of the server like the window; when the server is unreachable the title says so rather than the last count it had" }
  - { id: S12, kind: decision, said: "the menu is a view recomputed when the event log says something changed, window open or not; entering an attention state raises a system notification, configurable, on by default, opening the window on that record" }
  - { id: S13, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "plugins add a line under the work (a budget, a queue length) through a ui-menubar collection, drawn from the same primitives" }
  - { id: S14, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "a native menu cannot draw what a canvas can, so frame.yaml declares menubar as a second surface with its own closed subset: Text, Badge, List, Link, Button" }
  - { id: S15, kind: decision, said: "the desktop renderer declares it draws menubar; the terminal does not, so its absence is a declaration the gate reads, not a disagreement it forgives" }
  - { id: S16, kind: decision, said: "the harness reads the packaged app's menu template and title after every script step (title as text, menu as item tree): the projection, compared with the locked golden and the frame's subset" }
  - { id: S17, kind: decision, said: "ui-window asserts the menu bar's behaviour against the daemon on the conformance world" }
  - { id: S18, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers no operation: views menubar.title and menubar.menu over the session stream, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - plugins/ui-desktop/**
  - packages/ui/frame.yaml
  - packages/ui/src/**
  - packages/ui-conformance/src/**
  - packages/core/src/diagram.ts
  - packages/core/src/plugin.ts
  - packages/cli/src/status-view.ts
  - packages/workflow-ticket-to-qa/workflow.mmd
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - packages/ui/tests/surfaces.test.ts
  - packages/core/tests/mount.test.ts
  - packages/core/tests/diagram.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S18] }
  - { id: A2, statement: "the menu bar's projection holds the frame's menubar surface on every step of the script", proof: "deferred:assertion:frame.the_menu_bar_holds_its_surface", sources: [S14, S15, S16] }
  - { id: A3, statement: "a primitive outside the menubar subset is refused naming it", proof: "deferred:test:packages/ui/tests/surfaces.test.ts", sources: [S13, S14] }
  - { id: A4, statement: "a workflow whose diagram marks no state attention mounts unchanged", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S6] }
  - { id: A5, statement: "a state marked attention in a diagram mounts as an attention state", proof: "deferred:test:packages/core/tests/diagram.test.ts", sources: [S4, S5] }
  - { id: A6, statement: "the title counts exactly the records in an attention state, across every profile", proof: "deferred:assertion:window.the_menu_bar_counts_what_needs_you", sources: [S1, S2, S3, S7, S17] }
  - { id: A7, statement: "a record the daemon advances moves in the menu with the window closed", proof: "deferred:assertion:window.the_menu_bar_moves_without_the_window", sources: [S12, S17] }
  - { id: A8, statement: "choosing a record opens the window on that record", proof: "deferred:assertion:window.a_menu_item_opens_its_record", sources: [S8, S9] }
  - { id: A9, statement: "a record's submenu offers its row's ⋯ actions and no decision", proof: "deferred:assertion:window.the_menu_bar_is_no_other_road", sources: [S8, S9, S10] }
  - { id: A10, statement: "a record entering an attention state raises one notification, and none when notifications are off", proof: "deferred:assertion:window.attention_is_notified_once", sources: [S12] }
  - { id: A11, statement: "an unreachable server is in the title, and no stale count is shown", proof: "deferred:assertion:window.the_menu_bar_says_it_cannot_see", sources: [S11] }
  - { id: A12, statement: "the pulled handbrake is in the title", proof: "deferred:assertion:window.the_menu_bar_says_it_is_paused", sources: [S3] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A4, A5" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A4" }
  - { mechanism: status, answer: works, proof: "deferred:A6" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: hooks, answer: n/a, why: "attentionStates is a declared field, not a hook; before, after and interrupt are unchanged" }
  - { mechanism: calls, answer: n/a, why: "only an optional attentionStates field is added; how workflows call one another is unchanged" }
  - { mechanism: record-migration, answer: n/a, why: "a diagram gains a class line; no record shape changes, and a record's standing is derived, not stored" }
cut:
  - "deciding from the menu bar: refused; a decision happens in the thread"
exit: "on a Mac, window closed, a ticket escalates; the menu bar's count goes from 0 to 1 and a notification arrives; choosing it opens the window on that ticket; every step's menu bar projection equals the locked golden"
---
# amy lives in the menu bar

Most of the time a person does not want amy's window, only to know at a glance whether anything needs them and whether work is moving. Opening a terminal or a window to learn that nothing does is the interruption amy is meant to save.
