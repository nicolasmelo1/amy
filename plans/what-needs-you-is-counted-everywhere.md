---
base: 1471c13ea5a21e998b417b336683844b0932092f
sources:
  - { id: S1, kind: friction, said: "mostly a person wants, at a glance, whether anything needs them and whether work moves, like a build monitor in the menu bar; opening a terminal or window to learn nothing needs them is the interruption" }
  - { id: S2, kind: reference, ref: "plans/the-work-is-listed-everywhere.md", said: "the frame floats what needs you at the top right; this slice fills it, and gives the menu bar its own renderer" }
  - { id: S3, kind: code, ref: "packages/cli/src/status-view.ts", said: "the core knows a state only as waiting or terminal (standing), so ESCALATED and HUMAN_REVIEW look alike, though one waits on its owner and the other on somebody else" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a workflow may mark states attention in its diagram (class ESCALATED attention), read by the subset; the host reads them as attentionStates, states waiting on the work's owner" }
  - { id: S5, kind: decision, said: "a raw Workflow may declare attentionStates by hand; optional either way, so every workflow mounts unchanged with none; ticket-to-qa's diagram marks CLARIFYING and ESCALATED" }
  - { id: S6, kind: reference, ref: "plans/looks-are-configuration.md", said: "every record has one of four standings (attention, active, waiting, finished), counted by the menu bar and drawn by the window and the terminal" }
  - { id: S7, kind: decision, said: "the top-right icon opens a floating window listing what needs you, then what is stuck; its count is the icon's badge. Decided 2026-11-12" }
  - { id: S8, kind: decision, said: "a record is stuck when it waits on nobody and its state has not moved for ui.stuckAfter, 24 hours unless set, or the budget parked it. Proposed 2026-11-12" }
  - { id: S9, kind: reference, ref: "plans/decisions-are-asked-in-a-batch.md", said: "a batch of decisions reaches the owner as one message carrying the ones that still apply" }
  - { id: S10, kind: decision, said: "a batch of alerts and questions is one entry in the floating window, and each question is answered there from the answers it carries, as it would be in its thread. Decided 2026-11-12" }
  - { id: S11, kind: reference, ref: "docs/design/a-question-carries-its-answers.md", said: "a question can carry its answers, and the press comes back typed as a decision" }
  - { id: S12, kind: decision, said: "the menu bar and the desktop app are separate: the menu bar is its own renderer plugin, so anyone can write a different one, and the two are connected. Decided 2026-11-12" }
  - { id: S13, kind: reference, ref: "https://www.electronjs.org/docs/latest/api/tray", said: "a Tray is made in the main process; the documented example makes one with no window, and setTitle puts text beside the icon" }
  - { id: S14, kind: reference, ref: "https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app", said: "a packaged app registers a URL scheme with setAsDefaultProtocolClient and receives it on open-url (macOS) or second-instance; it needs packaging" }
  - { id: S15, kind: decision, said: "@amykit/ui-menubar is a renderer drawing only the menubar surface; choosing a record opens amy://<server>/<workId> in the desktop app when it is installed, and says how to add it when not. Proposed 2026-11-12" }
  - { id: S16, kind: reference, ref: "https://codexbar.app", said: "CodexBar's menu shows per provider the session and weekly limits as % left, reset countdowns, a pace (on pace, runs out in 4d 21h) and credits" }
  - { id: S17, kind: decision, said: "the menu shows what needs you, then each working record with its state and the states its diagram goes to next, then each harness's usage windows with % left, reset and pace; plugins add rows below. Decided 2026-11-12" }
  - { id: S18, kind: reference, ref: "docs/design/a-harness-shows-what-is-left.md", said: "each harness contributes one usage reader returning windows with a percentage and a reset, or unavailable" }
  - { id: S19, kind: decision, said: "the title is the core's: the count of records needing you and a mark while any record is worked; no plugin replaces it. Decided 2026-11-12" }
  - { id: S20, kind: decision, said: "pace is the window's used share over the share of its time gone: above one runs out early, and the menu says when at that rate. Proposed 2026-11-12" }
  - { id: S21, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "the menubar surface holds a closed subset: Text, Badge, List, Link, Button; after every script step the harness compares the menu's title and item tree with the golden" }
  - { id: S22, kind: decision, said: "entering an attention state raises one system notification, on by default, opening the desktop app on that record" }
  - { id: S23, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers views menubar.title and menubar.menu over the session stream, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - packages/ui/frame.yaml
  - packages/ui/conformance/golden.json
  - packages/core/src/diagram.ts
  - packages/core/src/plugin.ts
  - packages/core/tests/mount.test.ts
  - packages/core/tests/diagram.test.ts
  - packages/core/tests/diagram.property.test.ts
  - packages/cli/src/status-view.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-config.test.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - packages/services/surface.yaml
  - packages/services/src/domains/attention.ts
  - packages/services/tests/surface.test.ts
  - packages/services/tests/attention.property.test.ts
  - plugins/ui-webview/src/inbox.tsx
  - plugins/ui-ink/src/inbox.tsx
  - plugins/ui-desktop/src/deep-link.ts
  - plugins/ui-desktop/tests/deep-link.test.ts
  - plugins/ui-menubar/package.json
  - plugins/ui-menubar/src/index.ts
  - plugins/ui-menubar/src/main.ts
  - plugins/ui-menubar/src/menu.ts
  - plugins/ui-menubar/tests/menu.test.ts
  - packages/ui-conformance/src/script.ts
  - .software-factory/policy.yaml
  - plugins/ui-webview/package.json
  - plugins/ui-ink/package.json
  - plugins/ui-desktop/package.json
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S23] }
  - { id: A2, statement: "a workflow whose diagram marks no state attention mounts unchanged, and a state marked attention mounts as one", proof: "deferred:property:packages/core/tests/diagram.property.test.ts#only_first_state_of_a_class_line_marked", sources: [S3, S4, S5] }
  - { id: A3, statement: "the floating window lists exactly the records in an attention state, then the stuck ones, across every profile and server, and its icon's badge counts the first group", proof: "deferred:assertion:window.what_needs_you_is_the_same_everywhere", sources: [S1, S2, S6, S7] }
  - { id: A4, statement: "for any history, a record is stuck exactly when it waits on nobody and has not moved for stuckAfter, or the budget parked it", proof: "deferred:property:packages/services/tests/attention.property.test.ts#a_person_wait_counts_as_stuck", sources: [S8] }
  - { id: A5, statement: "a batch is one entry; a question answered there leaves the record, thread and log exactly as the same answer given in its thread", proof: "deferred:assertion:window.an_answer_is_the_same_from_the_inbox", sources: [S9, S10, S11] }
  - { id: A6, statement: "the menu bar's title counts the records needing you across every profile, and no plugin row changes it", proof: "deferred:assertion:window.the_menu_bar_title_is_the_cores", sources: [S1, S19] }
  - { id: A7, statement: "the menu lists what needs you, each working record with its state and next states from its diagram, then each harness's windows with % left, reset and pace", proof: "deferred:test:plugins/ui-menubar/tests/menu.test.ts", sources: [S16, S17, S18] }
  - { id: A8, statement: "for any window, pace is the used share over the elapsed share, and runs-out-at is the reset when pace is at most one", proof: "deferred:property:packages/services/tests/attention.property.test.ts#pace_ignores_elapsed_time", sources: [S20] }
  - { id: A9, statement: "the menu bar runs with the desktop app quit and its window never opened, and its projection holds the menubar surface on every step; a primitive outside it is refused naming it", proof: "deferred:assertion:frame.the_menu_bar_holds_its_surface", sources: [S12, S13, S15, S21] }
  - { id: A10, statement: "choosing a record in the menu opens the installed desktop app on it through amy://; without the app, the menu says so and names the command that adds it", proof: "deferred:test:plugins/ui-desktop/tests/deep-link.test.ts", sources: [S14, S15] }
  - { id: A11, statement: "a record the daemon advances into attention moves in the menu with every window closed, and raises one notification, none when notifications are off", proof: "deferred:assertion:window.attention_is_notified_once", sources: [S22] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A2" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2" }
  - { mechanism: status, answer: works, proof: "deferred:A3" }
  - { mechanism: config, answer: works, proof: "deferred:test:packages/cli/tests/ui-config.test.ts; ui.stuckAfter is a duration refused when not one" }
  - { mechanism: rendering, answer: works, proof: "deferred:A9" }
guarantee:
  - { holds: "the title counts exactly the records needing you, or says it cannot see", not_against: "a record that entered and left attention while the server was unreachable" }
  - { holds: "an answer from the floating window is the answer its thread would take", not_against: "a question answered in the thread at the same moment; the first to arrive decides, as two thread replies do" }
  - { holds: "one notification per entry into an attention state", not_against: "macOS Focus holding it back" }
  - { holds: "the menu bar moves with every window closed while it runs", not_against: "a menu bar not started at login" }
failures:
  - { step: menu, when: "a harness's usage reader is unavailable", goes_to: "that harness's row says unavailable; the others stay" }
  - { step: open, when: "amy:// is not registered because the desktop app is not installed", goes_to: "the menu says so and names amy plugin add @amykit/ui-desktop" }
cut:
  - "deciding from the menu bar: refused; the menu opens the record, and answers happen in the app's window or the thread"
  - "a bar drawn for each usage window: the menubar subset has no meter; the % is text"
  - "the desktop app drawing the menu bar: refused; one renderer per surface, and the menu bar is its own (S12)"
exit: "every window closed, a ticket escalates: the menu bar count goes 0 to 1 with Claude's 5-hour window and pace beneath, one notification opens the app on it, and the app's floating window answers its question as the thread would"
---
# What needs you is counted everywhere

Most of the time a person only wants to know whether anything needs them and
how much is left. This slice fills the window's floating inbox (needs you,
stuck, batches answered in place) and gives the menu bar a renderer of its
own that opens the desktop app on what it shows.
