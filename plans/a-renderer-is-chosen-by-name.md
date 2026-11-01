---
sources:
  - { id: S1, kind: friction, said: "a window only one renderer opens grows a flag per renderer (--terminal, --desktop, --phone), and a renderer somebody else writes has none; every other part of amy is a plugin found by its registered name" }
  - { id: S2, kind: decision, said: "a renderer is a plugin contributing to ui-renderer under a name (text, desktop, terminal, a third party's); it says which frame.yaml surfaces it draws, how to start, and how to build when it has a build" }
  - { id: S3, kind: reference, ref: "plans/the-window-is-served.md", said: "a renderer starts as a client of a server: the local one, or ui.server when config.yaml sets it" }
  - { id: S4, kind: decision, said: "amy ui opens ui.default from config.yaml; amy ui <name> and amy ui --mode <name> open that renderer; amy ui list shows what is installed and which is the default" }
  - { id: S5, kind: decision, said: "a name nothing installed is refused with the installed list and how to add one (amy plugin add @amykit/ui-desktop), the way a missing workflow already is" }
  - { id: S6, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "text arrives with the command, inside @amykit/ui which the CLI depends on, so amy ui works bare and on a displayless server; every other renderer is installed by name, as many as wanted" }
  - { id: S7, kind: decision, said: "amy ui build <name> runs the build a renderer declares (a desktop app packaged, a phone app compiled: neither loads a package at run time) against the current SDK, with themes and openers' client halves beside it" }
  - { id: S8, kind: decision, said: "a built app carries the contract hash it was built for, and the server tells it when it is out of date" }
  - { id: S9, kind: decision, said: "views are computed on the server and arrive as data, so a build never needs view plugins; only a plugin changing how something is drawn asks for a rebuild, and the build says which it took" }
  - { id: S10, kind: decision, said: "ui-frame finds every renderer by name through ui-renderer, not a list in the script, so an installed renderer cannot escape the gate; ui-window gains the command" }
touches:
  - packages/cli/src/index.ts
  - packages/core/src/config-schema.ts
  - packages/core/src/mount.ts
  - packages/ui/**
  - packages/ui-conformance/src/**
  - packages/cli/tests/ui-command.test.ts
  - packages/cli/tests/ui-build.test.ts
  - packages/core/tests/mount.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "amy ui opens ui.default; amy ui <name> and amy ui --mode <name> open that renderer", proof: "deferred:assertion:window.a_renderer_opens_by_name", sources: [S1, S4] }
  - { id: A2, statement: "a name nothing installed is refused with the installed list and the command that adds one", proof: "deferred:test:packages/cli/tests/ui-command.test.ts", sources: [S5] }
  - { id: A3, statement: "on the bare install, amy ui opens text and nothing was installed for it", proof: "deferred:assertion:bare.a_window_needs_no_install", sources: [S3, S6] }
  - { id: A4, statement: "two plugins contributing the same renderer name are refused at boot, naming both", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S2] }
  - { id: A5, statement: "a renderer declaring a surface frame.yaml does not define is refused at boot, and any renderer declaring defined surfaces mounts with no edit to the frame", proof: "deferred:test:packages/cli/tests/ui-command.test.ts", sources: [S2] }
  - { id: A6, statement: "every installed renderer is driven by the frame's script, found through ui-renderer", proof: "deferred:assertion:frame.every_installed_renderer_is_measured", sources: [S10] }
  - { id: A7, statement: "a built app shows a view-only plugin installed on the server after the build, without rebuilding", proof: "deferred:assertion:window.a_view_needs_no_rebuild", sources: [S8, S9] }
  - { id: A8, statement: "amy ui build names the drawing plugins it took", proof: "deferred:test:packages/cli/tests/ui-build.test.ts", sources: [S7, S9] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A4, A5" }
  - { mechanism: config, answer: works, proof: "deferred:A1" }
  - { mechanism: rendering, answer: works, proof: "deferred:A6, A7" }
cut:
  - "a flag per renderer on amy ui (--terminal, --desktop, --phone): refused; a renderer is chosen by name"
  - "shipping any renderer but text with the CLI: refused; an install carrying Electron is a hundred megabytes nobody asked for on a maybe screenless machine"
  - "the desktop renderer: not needed here; it arrives with plans/amy-has-a-window.md"
exit: "bare install: amy ui opens text against the local server; an outside packaged renderer fixture set as ui.default opens on amy ui, amy ui text opens text, and the frame's script drives fixture (window surface only), script and frame unedited"
---
# A renderer is chosen by name

A window only one renderer can open grows a flag per renderer, and a renderer somebody else writes gets none. Every other part of amy is a plugin found by its name; a renderer should be too.
