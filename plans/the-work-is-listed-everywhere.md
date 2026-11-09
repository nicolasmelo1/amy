---
sources:
  - { id: S1, kind: reference, ref: "plans/the-window-is-designed-once.md", said: "the three renderers exist and every primitive is proven on every surface that declares it; this is the first slice of the window, landing on all three at once" }
  - { id: S2, kind: decision, said: "the window an install ships is small on purpose: amy is a workflow builder, so it shows the work and lets a person talk to it; everything beyond is a plugin" }
  - { id: S3, kind: decision, said: "layout: nav 1 sections on top; nav 2 search and list at left (profile, + groom); canvas with header, state strip and tabs (Timeline, Diff, plugin tabs); a right panel that opens and closes; ⌘K ask anything" }
  - { id: S4, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "nav 1 is Work, Workflows, Settings: reordered in config.yaml, never removed; plugins may add sections after them" }
  - { id: S5, kind: decision, said: "nav 2 is a search box and the section's list: under Work every record of every connected server, grouped by server then profile, with its state and last harness; under Workflows the profiles, by server" }
  - { id: S6, kind: decision, said: "the same profile or record id on two connected servers is two entries, each shown under its own server's name; nothing merges them. Decided 2026-11-08" }
  - { id: S7, kind: reference, ref: "plans/the-window-is-served.md", said: "every renderer is a client only: it connects to the local server and those ui.servers names, and draws what they send through the generated SDK" }
  - { id: S8, kind: reference, ref: "plans/a-renderer-is-chosen-by-name.md", said: "@amykit/ui-desktop contributes renderer desktop and @amykit/ui-ink renderer terminal, each declaring the surfaces it draws; amy ui <name> opens one, amy ui opens ui.default" }
  - { id: S9, kind: decision, said: "no renderer reads a file under amy's home, so each shows this machine's work or one reached through a tunnel; amy ui build desktop packages the desktop app for macOS" }
  - { id: S10, kind: decision, said: "the terminal's frame is the same: nav 1 as a row of sections, nav 2 as a list, the canvas, and the right panel toggled by a key; ⌘K is the same ask" }
  - { id: S11, kind: decision, said: "the desktop app stays resident with one menu bar item: the macOS menu bar first, the system tray on Windows and Linux when built. Its menu is the work, grouped as the window groups it, and Open amy" }
  - { id: S12, kind: decision, said: "closing the window does not quit; the app stays resident. mod+k may be a global shortcut, configurable in config.yaml and off by default (a promise about every other app), never ⌘Space, which is Spotlight's" }
  - { id: S13, kind: decision, said: "the menu bar is a client of the server like the window; when the server is unreachable the title says so rather than the last count it had" }
  - { id: S14, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "every renderer answers the frame's modal keymap: j/k through a list, h/l between nav 2, canvas and panel, gg/G, / to search, : for a command, counts, sequences and a leader key" }
  - { id: S15, kind: decision, said: "keys are remappable in ui.keys with Neovim's own key notation, the remap shared by every renderer because it is the frame's" }
  - { id: S16, kind: friction, said: "a window making terminal people reach for arrow keys is one they close; the one operator who asked named herdr as the feel: keyboard-first, still answering the mouse" }
  - { id: S17, kind: decision, said: "Ink has no mouse, so the terminal renderer turns on SGR mouse reporting (modes 1000/1006) when it starts, off when it exits or suspends, translating clicks and the wheel into the frame actions keys reach" }
  - { id: S18, kind: decision, said: "a click on a row opens it, on a tab selects it, on the panel's edge toggles it; the wheel scrolls the list or canvas; a terminal reporting no mouse leaves the keys exactly as they were" }
  - { id: S19, kind: decision, said: "gate ui-frame gains the desktop and terminal renderers: plugins/ui-desktop/src/**, plugins/ui-webview/src/** and plugins/ui-ink/src/** join its activation" }
  - { id: S24, kind: decision, said: "the frame script runs on the packaged app's own Chromium and the installed Ink plugin at 120×40, by default keys, the conformance remap and the mouse, comparing projections every step" }
  - { id: S25, kind: decision, said: "the terminal is measured from this first slice: launch to PTY ready, launch to the first matching frame, and typing latency at p50, p95, p99 and max. Decided 2026-11-03" }
  - { id: S20, kind: decision, said: "new gate ui-window: install amy, start the daemon on the conformance world with fake tracker, forge and conversation, launch each renderer, drive the script; every window.* assertion is required, and activation is packages/server/src/**, packages/cli/src/ui/**, packages/ui/**, plugins/ui-*/src/**" }
  - { id: S21, kind: decision, said: "the desktop app is measured from this first slice: launch to the first frame showing the work list, CPU over a 30 s idle, resident memory, and a 60 Hz patch stream all drawn. Decided 2026-11-03" }
  - { id: S22, kind: reference, ref: "plans/the-performance-guard-can-fail.md", said: "each measure is held to a threshold in the policy against a baseline naming its environment, over alternating trials, and the guard proves every run that it can go red" }
  - { id: S23, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "work.list and the session views arrive with the window is served; this slice delivers menubar.menu, flipped to delivered in surface.yaml in the same pull request" }
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
  - packages/ui/**
  - packages/ui-conformance/src/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this slice delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S23] }
  - { id: A2, statement: "the desktop app, the web page and the terminal hold the frame on every step of the script, and agree on every region", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S1, S3, S10, S19, S24] }
  - { id: A3, statement: "the work list carries exactly the records amy status --json does on each connected server, for every profile, under that server's name, in every renderer and in the menu bar's menu; the same id on two servers is two entries", proof: "deferred:assertion:window.the_list_is_amy_status", sources: [S5, S6, S11, S20] }
  - { id: A4, statement: "a record the daemon advances moves in every open renderer and in the menu with no reload, within one second of its event", proof: "deferred:assertion:window.a_record_moves_without_a_reload", sources: [S7, S11, S20] }
  - { id: A5, statement: "nav 1 reorders from config.yaml in every renderer, and a section that does not exist is refused by name", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S2, S4] }
  - { id: A6, statement: "no renderer reads a file under amy's home; each draws everything from the server", proof: "deferred:assertion:server.a_client_needs_nothing_but_the_server", sources: [S7, S8, S9] }
  - { id: A7, statement: "amy ui build desktop produces a macOS app that opens against a server", proof: "deferred:assertion:window.the_built_app_opens", sources: [S9] }
  - { id: A8, statement: "closing the desktop window leaves the app and its menu bar item running, and reopening it shows the record that was selected", proof: "deferred:assertion:window.closing_is_not_quitting", sources: [S11, S12] }
  - { id: A9, statement: "the global shortcut is off unless configured, and a configured one the system already owns is refused by name", proof: "deferred:assertion:window.a_global_shortcut_is_asked_for_not_taken", sources: [S12] }
  - { id: A10, statement: "an unreachable server is in the menu bar's title, and no stale count or list is shown in any renderer", proof: "deferred:assertion:window.the_menu_bar_says_it_cannot_see", sources: [S13] }
  - { id: A11, statement: "the default keys, the conformance remap and the mouse drive every renderer to the same projections, step for step; counts and sequences work as in Neovim (5j, gg)", proof: "deferred:assertion:frame.keys_remaps_and_the_mouse_agree", sources: [S14, S15, S16, S18, S19, S24] }
  - { id: A12, statement: "the terminal's mouse reporting is on while it runs and off after it exits or suspends, and a terminal that reports no mouse still answers every key", proof: "deferred:test:plugins/ui-ink/tests/mouse.test.ts", sources: [S17, S18] }
  - { id: A13, statement: "the narrowest width the frame allows still draws every region in every renderer", proof: "deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width", sources: [S10, S19] }
  - { id: A14, statement: "each renderer's measures are recorded by ui-window, and one past its threshold turns the gate red naming it", proof: "deferred:assertion:window.every_renderer_is_within_its_budget", sources: [S21, S22, S25] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A5, A9" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A11, A13" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A3" }
guarantee:
  - { holds: "a record the daemon advances moves in every open renderer within a second of its event", not_against: "the server restarting under an open renderer, which shows it away by name until it answers again" }
  - { holds: "every region is drawn at frame.yaml's narrowest size, 80×24 cells or 720×480 px", not_against: "a terminal or window smaller than that" }
  - { holds: "the renderers agree on every region, measured in cells or boxes", not_against: "a glyph whose width the terminal and Ink disagree on (emoji, East Asian wide, ambiguous width), shifting cells by the difference" }
  - { holds: "mouse reporting is off after the terminal renderer exits or suspends", not_against: "a kill -9 or crash, which leaves the terminal in mouse mode until reset" }
  - { holds: "a terminal reporting no mouse still answers every key", not_against: "a multiplexer (tmux, screen) not passing mouse reports, or a key the terminal never sends (⌘ chords)" }
  - { holds: "the global shortcut is off unless configured, and one the system already owns is refused", not_against: "an app registering the same shortcut after amy, which macOS arbitrates" }
  - { holds: "amy ui build desktop produces a macOS app that opens on the machine that built it", not_against: "Gatekeeper on another Mac: the app is neither signed nor notarised" }
  - { holds: "the desktop app and its menu bar item are built and measured on macOS", not_against: "Windows and Linux builds and the system tray, which no gate measures yet" }
  - { holds: "every region is reached by the frame's keys", not_against: "screen readers: no accessibility tree beyond what Chromium and the terminal give" }
cut:
  - "a window served to a browser tab as the product: refused, it cannot sit in the menu bar or own a global shortcut; the web page is the design system's and the served window's, not a fourth app"
  - "⌘Space as the global shortcut: refused, it is Spotlight's"
  - "work.list and work.detail: not delivered by this slice, they arrived with the window is served"
exit: "on a Mac, amy ui desktop, amy ui terminal and the menu bar item show one ticket going DISCOVERED→IMPLEMENTING within a second, driven by keys in the terminal and a click in the app; ui-frame and ui-window green"
---
# The work is listed everywhere

The first slice of the window: the frame, the work list and the menu bar item, in the desktop app and the terminal at once. Before this, everything amy knows is reachable through `amy status` and a Slack thread, but nothing shows it in one place, moving.
