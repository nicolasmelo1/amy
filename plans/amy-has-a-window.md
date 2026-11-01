---
sources:
  - { id: S1, kind: decision, said: "the window an install ships is small on purpose: amy is a workflow builder, so it shows the work and lets a person talk to it; everything beyond is a plugin" }
  - { id: S2, kind: decision, said: "layout: nav 1 sections on top; nav 2 search and list at left (profile, + groom); canvas with header, state strip and tabs (Timeline, Diff, plugin tabs); a right panel that opens and closes; ⌘K ask anything" }
  - { id: S3, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "nav 1 is Work, Workflows, Settings: reordered in config.yaml, never removed; plugins may add sections after them" }
  - { id: S4, kind: decision, said: "nav 2 is a search box and the section's list: under Work every record of every profile, grouped by profile, with its state and the harness that last ran it; under Workflows the profiles" }
  - { id: S5, kind: decision, said: "a ⋯ acts on its own row and nothing wider, through an existing command: a record's offers poke; a workflow's offers remove <name>, with amy remove's refusal when the machine would not survive it" }
  - { id: S6, kind: decision, said: "the handbrake (pause, resume) stops every workflow at once, so it is on no row: it sits in the Workflows canvas, saying what it stops" }
  - { id: S7, kind: reference, ref: "plans/work-that-is-over-goes-away.md", said: "retiring one record waits for this plan, which adds the command" }
  - { id: S8, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a record's canvas: the strip is its workflow.mmd with the current state marked, and a timeline joining its history to events mentioning it. A workflow's canvas: its diagram beside its text" }
  - { id: S9, kind: decision, said: "a workflow under ~/.amy/workflows is edited as text: saving reads it with the host's subset, writes the file, and shows the check's drawn-not-walked list; a refused diagram is not saved, the refusal naming the line" }
  - { id: S10, kind: decision, said: "a workflow installed as a package is shown, not edited; one with no diagram shows its declared states and says it has none" }
  - { id: S11, kind: decision, said: "the right panel, opened and closed by the person, is the log filtered to the selected record, or the work thread when the record waits on its owner" }
  - { id: S12, kind: decision, said: "Settings is config.yaml edited as text; saving runs boot's assemble, and a config that would not mount is not saved, every refusal shown by name as mount() reports them" }
  - { id: S13, kind: decision, said: "a desktop app, not a page: a tab is one among forty, with no menu-bar place or global shortcut, and amy runs all day. macOS first; Windows and Linux are the same app built for them" }
  - { id: S14, kind: decision, said: "Electron, because the engine the gate measures must be the one that ships: its pinned Chromium on every platform is what the-frame-is-closed's projection reads. Tauri's WebKit/WebView2/WebKitGTK make one green gate say nothing of the others" }
  - { id: S15, kind: decision, said: "Electron is JavaScript end to end, as amy is; its larger download is paid once, named in the dependency lock, only by whoever installs this renderer (a renderer is chosen by name)" }
  - { id: S16, kind: reference, ref: "https://pele.run", said: "the desktop renderer draws StateMachine, which carries the diagram text, with Pele, Obsidian's Mermaid renderer: MIT, no dependencies, synchronous, SVG string out; a dependency of @amykit/ui-desktop only" }
  - { id: S17, kind: decision, said: "the app registers only pele/core and pele/diagrams/state, about 130 KB minified and 52 KB gzipped, against 712 KB for the full bundle" }
  - { id: S18, kind: decision, said: "theme tokens become Pele's CSS variables (--pele-bg, --pele-fg, --pele-line, --pele-accent, …): a-renderer-names-no-colour holds, a theme switch recolours without re-rendering, classDef is not read (kept for GitHub, Obsidian). It draws what Obsidian would" }
  - { id: S19, kind: reference, ref: "plans/the-window-is-served.md", said: "@amykit/ui-desktop contributes renderer desktop, opened by amy ui desktop, or amy ui when ui.default says so. A client only: it connects to the local server or ui.server and draws what it sends through the generated SDK" }
  - { id: S20, kind: decision, said: "it reads no file under amy's home, so it shows this machine's work or one reached through a tunnel; amy ui build desktop packages it as a macOS app" }
  - { id: S21, kind: reference, ref: "plans/amy-lives-in-the-menu-bar.md", said: "closing the window does not quit; the app stays resident. mod+k may be a global shortcut, configurable in config.yaml and off by default (a promise about every other app), never ⌘Space, which is Spotlight's" }
  - { id: S22, kind: decision, said: "the window writes nothing the CLI cannot: every intent resolves to a function a command already calls, so it is never a second road to the tracker" }
  - { id: S23, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "gate ui-frame gains the desktop renderer: plugins/ui-desktop/src/** joins its activation, and the conformance script runs against the packaged app's own Chromium" }
  - { id: S24, kind: decision, said: "new gate ui-window: install amy, start the daemon on the conformance world with fake tracker, forge and conversation, launch the packaged app, drive the script; every window.* assertion is required" }
  - { id: S25, kind: decision, said: "ui-window activation is packages/server/src/**, packages/cli/src/ui/**, packages/ui/**, plugins/ui-desktop/src/**: the server holds every behaviour exercised, so a change there expires the proof" }
  - { id: S26, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers domains machine, workflows, settings (getHandbrake, setHandbrake, removeWorkflow, getConfig, saveConfig) and views workflows.list, workflows.handbrake, work.log, local-only settings.config, flipped to delivered in surface.yaml in the same PR" }
touches:
  - plugins/ui-desktop/**
  - packages/server/surface.yaml
  - packages/server/src/**
  - packages/server/tests/surface.test.ts
  - packages/cli/src/ui/**
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-config.test.ts
  - packages/cli/tests/ui-actions.test.ts
  - packages/ui/**
  - packages/ui-conformance/src/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S26] }
  - { id: A2, statement: "the desktop renderer holds the frame on every step of the script", proof: "deferred:assertion:frame.every_region_sits_where_declared", sources: [S2, S11, S14, S23] }
  - { id: A3, statement: "the desktop and the text renderer agree on every region", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S14, S23] }
  - { id: A4, statement: "a record the daemon advances moves in the open window with no reload, within one second of its event", proof: "deferred:assertion:window.a_record_moves_without_a_reload", sources: [S19, S24, S25] }
  - { id: A5, statement: "the work list carries exactly the records amy status --json does, for every profile", proof: "deferred:assertion:window.the_list_is_amy_status", sources: [S4, S24] }
  - { id: A6, statement: "nav 1 reorders from config.yaml, and a section that does not exist is refused by name", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S1, S3] }
  - { id: A7, statement: "saving a config that would not mount keeps the old file and shows every refusal", proof: "deferred:assertion:window.a_config_that_would_not_mount_is_not_saved", sources: [S12] }
  - { id: A8, statement: "a workflow's diagram edited in its canvas is saved only when the subset reads it, and the save shows what is drawn and not walked; a package's diagram offers no edit", proof: "deferred:assertion:window.a_diagram_is_edited_as_text", sources: [S9, S10] }
  - { id: A9, statement: "the strip in a record's canvas is its workflow's diagram, with every edge the file draws and the record's state marked", proof: "deferred:assertion:window.the_strip_is_the_diagram", sources: [S8, S18] }
  - { id: A10, statement: "Pele is a dependency of @amykit/ui-desktop and of no other package, and the app bundles only its state diagram", proof: "deferred:test:plugins/ui-desktop/tests/bundle.test.ts", sources: [S15, S16, S17] }
  - { id: A11, statement: "the app draws everything from the server and reads nothing under amy's home", proof: "deferred:assertion:server.a_client_needs_nothing_but_the_server", sources: [S19, S20] }
  - { id: A12, statement: "amy ui build desktop produces a macOS app that opens against a server", proof: "deferred:assertion:window.the_built_app_opens", sources: [S13, S20] }
  - { id: A13, statement: "the global shortcut is off unless configured, and a configured one the system already owns is refused by name", proof: "deferred:assertion:window.a_global_shortcut_is_asked_for_not_taken", sources: [S21] }
  - { id: A14, statement: "closing the window leaves the app running, and reopening it shows the record that was selected", proof: "deferred:assertion:window.closing_is_not_quitting", sources: [S21] }
  - { id: A15, statement: "every ⋯ action leaves the same record, queue and log a run of its command leaves", proof: "deferred:assertion:window.an_action_is_its_command", sources: [S5, S22] }
  - { id: A16, statement: "no row's ⋯ offers an action wider than its row: no record row pauses the machine or removes a plugin", proof: "deferred:test:packages/cli/tests/ui-actions.test.ts", sources: [S5, S6, S7] }
  - { id: A17, statement: "the fake tracker's and forge's call logs hold no write the window made", proof: "deferred:assertion:window.the_window_writes_nothing_the_cli_cannot", sources: [S22] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A6, A7, A13" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3, A9" }
cut:
  - "a window served to a browser tab: refused, it cannot sit in the menu bar or own a global shortcut (S13)"
  - "Tauri: refused, a gate green in one system webview says nothing about the other two (S14)"
  - "a form over Settings: later"
  - "retiring one record from the window: waits for work-that-is-over-goes-away (S7)"
  - "⌘Space as the global shortcut: refused, it is Spotlight's"
  - "work.list and work.detail: not delivered by this row, they arrived with the window is served (S19)"
exit: "on a Mac, daemon running: plugin add @amykit/ui-desktop, amy ui desktop; a ticket goes DISCOVERED→IMPLEMENTING untouched; another poked from ⋯; an own diagram's added edge listed drawn, not walked; broken Settings config.yaml breaks nothing; sf check green on ui-frame, ui-window"
---
# amy has a window

Everything amy knows is reachable through `amy status`, `amy budget`, `amy brief`, the event log and a Slack thread, but nothing shows it in one place, moving, beside the machine's reasoning about a piece of work.
