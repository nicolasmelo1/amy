---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: reference, ref: "plans/the-window-is-designed-once.md", said: "the renderers exist and every primitive is proven on every surface that declares it; this is the first slice of the window, landing on the desktop app and the terminal at once" }
  - { id: S2, kind: decision, said: "the window an install ships is small on purpose: amy is a workflow builder, so it shows the work and lets a person talk to it; everything beyond is a plugin" }
  - { id: S3, kind: decision, said: "the window is a breadcrumb on top with a dropdown per level, Project > Workflow > Record (shop · ticket-to-qa ▾ · SHOP-1 ▾), and a canvas of nodes in the middle. Decided 2026-11-12" }
  - { id: S4, kind: decision, said: "floating at the top right, a few icons: what needs you, the sidebar's toggle, settings; floating at the bottom right, ? listing every command and the chat. Decided 2026-11-12" }
  - { id: S5, kind: decision, said: "the right sidebar is a joker: closed until a node is chosen, then that state's view. Decided 2026-11-12" }
  - { id: S6, kind: decision, said: "with no workflow, the canvas holds the chat to make one; with workflows, one is always selected, the last used, so an empty canvas is the exception. Decided 2026-11-12" }
  - { id: S7, kind: decision, said: "frame.yaml's regions become breadcrumb, canvas, sidebar, corner.top and corner.bottom, replacing nav1, nav2, panel and palette; the golden projection is rewritten and both relocked in this slice's pull request. Proposed 2026-11-12" }
  - { id: S8, kind: decision, said: "the Record dropdown lists every record of the selected workflow on every connected server, under the server's name, with its state and standing; two servers' TBO-1 stay two entries. Proposed 2026-11-12" }
  - { id: S9, kind: reference, ref: "plans/the-window-is-served.md", said: "every renderer is a client only: it connects to the local server and those ui.servers names, and draws what they send through the generated SDK" }
  - { id: S10, kind: reference, ref: "plans/a-renderer-is-chosen-by-name.md", said: "@amykit/ui-desktop contributes renderer desktop and @amykit/ui-ink renderer terminal, each declaring the surfaces it draws; the menu bar is a renderer of its own" }
  - { id: S11, kind: decision, said: "the terminal's frame is the same: the breadcrumb a line on top, the canvas, the sidebar toggled by a key, the corners as a status line at the bottom, each item reached by a key" }
  - { id: S12, kind: decision, said: "closing the desktop window does not quit; the app stays resident. A global shortcut is off by default and configurable, never ⌘Space, which is Spotlight's" }
  - { id: S13, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "every renderer answers the frame's modal keymap, counts and a leader key; keys are remappable in Neovim's notation, the remap shared by every renderer" }
  - { id: S14, kind: decision, said: "the terminal renderer turns on SGR mouse reporting (1000/1006) while it runs and off when it exits or suspends; a terminal reporting no mouse keeps every key" }
  - { id: S15, kind: decision, said: "gate ui-frame gains the desktop and terminal renderers; gate ui-window installs amy, runs the conformance world on fake tracker, forge and conversation, launches each renderer and drives the frame script" }
  - { id: S16, kind: decision, said: "each renderer is measured from this slice: launch to first frame, CPU over 30 s idle, resident memory, a 60 Hz patch stream drawn, and terminal typing latency at p50, p95, p99. Decided 2026-11-03" }
  - { id: S17, kind: reference, ref: "plans/the-performance-guard-can-fail.md", said: "each measure is held to a threshold against a baseline naming its environment, over alternating trials, and the guard proves every run that it can go red" }
  - { id: S18, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "work.list and the session views arrive with the window is served; this slice adds the project and workflow lists the breadcrumb reads, flipped to delivered in surface.yaml" }
touches:
  - packages/ui/frame.yaml
  - packages/ui/conformance/golden.json
  - packages/ui/conformance/config.yaml
  - packages/ui/src/frame/frame.ts
  - packages/ui/src/frame/keymap.ts
  - packages/ui/tests/frame.test.ts
  - packages/ui-conformance/src/script.ts
  - packages/ui-conformance/src/world.ts
  - packages/ui-conformance/src/projection.ts
  - packages/services/surface.yaml
  - packages/services/src/domains/work.ts
  - packages/services/tests/surface.test.ts
  - plugins/ui-webview/package.json
  - plugins/ui-webview/src/frame.tsx
  - plugins/ui-webview/src/breadcrumb.tsx
  - plugins/ui-webview/src/corners.tsx
  - plugins/ui-desktop/package.json
  - plugins/ui-desktop/src/main.ts
  - plugins/ui-ink/package.json
  - plugins/ui-ink/src/frame.tsx
  - plugins/ui-ink/src/mouse.ts
  - plugins/ui-ink/tests/mouse.test.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-config.test.ts
  - .software-factory/policy.yaml
  - .software-factory/locks/generated.lock.json
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S18] }
  - { id: A2, statement: "frame.yaml declares breadcrumb, canvas, sidebar, corner.top and corner.bottom and no other region; nav1, nav2, panel and palette are gone, and the golden and its lock move in the same commit", proof: "deferred:test:packages/ui/tests/frame.test.ts", sources: [S3, S4, S5, S7] }
  - { id: A3, statement: "the desktop app and the terminal hold the frame on every step of the script and agree on every region", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S1, S3, S10, S11, S15] }
  - { id: A4, statement: "the Record dropdown carries exactly the records amy status --json does for the selected workflow on each connected server, under that server's name; one id on two servers is two entries", proof: "deferred:assertion:window.the_list_is_amy_status", sources: [S2, S8, S9] }
  - { id: A5, statement: "with no workflow mounted the canvas holds the chat; with one, a workflow is selected on open, the last one used", proof: "deferred:assertion:window.a_workflow_is_always_selected", sources: [S6] }
  - { id: A6, statement: "a record the daemon advances moves in every open renderer with no reload, within one second of its event", proof: "deferred:assertion:window.a_record_moves_without_a_reload", sources: [S9, S15] }
  - { id: A7, statement: "the corners hold what needs you, the sidebar toggle and settings at the top, ? and the chat at the bottom: floating in the app, a status line in the terminal, each reached by a key", proof: "deferred:assertion:frame.the_corners_hold_what_they_declare", sources: [S4, S11, S13] }
  - { id: A8, statement: "closing the desktop window leaves the app resident, and reopening it shows the project, workflow and record that were selected", proof: "deferred:assertion:window.closing_is_not_quitting", sources: [S12] }
  - { id: A9, statement: "the global shortcut is off unless configured, and a configured one the system already owns is refused by name", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S12] }
  - { id: A10, statement: "the default keys, the conformance remap and the mouse drive every renderer to the same projections, step for step; counts and sequences work as in Neovim", proof: "deferred:assertion:frame.keys_remaps_and_the_mouse_agree", sources: [S13, S14, S15] }
  - { id: A11, statement: "the terminal's mouse reporting is on while it runs and off after it exits or suspends, and a terminal that reports no mouse still answers every key", proof: "deferred:test:plugins/ui-ink/tests/mouse.test.ts", sources: [S14] }
  - { id: A12, statement: "the narrowest size the frame allows still draws every region in every renderer", proof: "deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width", sources: [S7, S11] }
  - { id: A13, statement: "each renderer's measures are recorded by ui-window, and one past its threshold turns the gate red naming it", proof: "deferred:assertion:window.every_renderer_is_within_its_budget", sources: [S16, S17] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A9" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3, A10, A12" }
guarantee:
  - { holds: "a record the daemon advances moves in every open renderer within a second of its event", not_against: "the server restarting under an open renderer, which shows it away by name until it answers again" }
  - { holds: "every region is drawn at frame.yaml's narrowest size", not_against: "a terminal or window smaller than that" }
  - { holds: "the renderers agree on every region, measured in cells or boxes", not_against: "a glyph whose width the terminal and Ink disagree on (emoji, East Asian wide)" }
  - { holds: "mouse reporting is off after the terminal renderer exits or suspends", not_against: "a kill -9 or crash, which leaves the terminal in mouse mode until reset" }
  - { holds: "the desktop app is built and measured on macOS", not_against: "Windows and Linux builds, which no gate measures yet" }
failures:
  - { step: open, when: "the last used workflow is no longer mounted", goes_to: "the first mounted workflow is selected, and the breadcrumb says why" }
cut:
  - "a left list of sections (Work, Workflows, Settings): replaced by the breadcrumb and the settings icon (S3, S4)"
  - "the menu bar: a renderer of its own, in what-needs-you-is-counted-everywhere"
  - "the chat's own behaviour: a-conversation-before-the-work; this slice only places its button"
  - "⌘Space as the global shortcut: refused, it is Spotlight's"
exit: "on a Mac, amy ui desktop and amy ui terminal show shop › ticket-to-qa › SHOP-1 move DISCOVERED→IMPLEMENTING within a second, chosen from the breadcrumb by keys in the terminal and clicks in the app; ui-frame and ui-window green"
---
# The work is listed everywhere

The first slice of the window, in the desktop app and the terminal at once:
a breadcrumb choosing project, workflow and record, the canvas between, a
sidebar that opens on what is chosen, and two floating corners.
