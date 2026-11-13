---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: friction, said: "a window only one renderer opens grows a flag per renderer (--terminal, --desktop, --phone), and a renderer somebody else writes has none; every other part of amy is a plugin found by its registered name" }
  - { id: S2, kind: decision, said: "a renderer is a plugin contributing to ui-renderer under a name (text, desktop, terminal, menubar, a third party's); it says which frame.yaml surfaces it draws, how to start, and how to build when it has a build" }
  - { id: S3, kind: reference, ref: "plans/the-window-is-served.md", said: "a renderer starts as a client of servers: the local one, and each one ui.servers names in config.yaml" }
  - { id: S4, kind: decision, said: "amy ui opens ui.default from config.yaml; amy ui <name> opens that renderer; amy ui list shows what is installed and which is the default" }
  - { id: S5, kind: decision, said: "a name nothing installed is refused with the installed list and how to add one (amy plugin add @amykit/ui-desktop), the way a missing workflow already is" }
  - { id: S6, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "text arrives with the command, inside @amykit/ui which the CLI depends on, so amy ui works bare and on a displayless server; every other renderer is installed by name" }
  - { id: S7, kind: decision, said: "the desktop app is built once and the phone app is built once; the same build serves every install, and what it shows changes with what the server has mounted. Decided 2026-11-12" }
  - { id: S8, kind: reference, ref: "plans/a-page-is-drawn-only-where-it-can-be.md", said: "a plugin's page is served at run time, so even a plugin drawing beyond the vocabulary asks for no rebuild" }
  - { id: S9, kind: decision, said: "amy ui build <name> runs the build a renderer declares against the current SDK and reads no mounted plugin; a built app carries the contract hash it was built for, and the server says when it is out of date" }
  - { id: S10, kind: decision, said: "the menu bar is a renderer of its own, so anyone can write another; ui.menubar names the one that draws it, and only one runs. Decided 2026-11-12" }
  - { id: S11, kind: decision, said: "ui-frame finds every renderer by name through ui-renderer, not a list in the script, so an installed renderer cannot escape the gate; ui-window gains the command" }
  - { id: S12, kind: decision, said: "a renderer's name is [a-z][a-z0-9-]*, and neither list nor build; any other name, one starting with - included, is refused at mount, naming the plugin and the name. Decided 2026-11-08" }
  - { id: S13, kind: decision, said: "a ui.default or ui.menubar naming no installed renderer, or one not declaring that surface, is refused at boot, naming it and the installed list. Decided 2026-11-08" }
touches:
  - packages/cli/src/index.ts
  - packages/cli/src/config.ts
  - packages/core/src/config-schema.ts
  - packages/core/src/mount.ts
  - packages/ui/src/frame/renderer.ts
  - packages/ui-conformance/src/script.ts
  - packages/cli/tests/ui-command.test.ts
  - packages/cli/tests/ui-build.test.ts
  - packages/cli/tests/ui-build.property.test.ts
  - packages/core/tests/mount.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "amy ui opens ui.default, and amy ui <name> opens that renderer", proof: "deferred:assertion:window.a_renderer_opens_by_name", sources: [S1, S4] }
  - { id: A2, statement: "a name nothing installed is refused with the installed list and the command that adds one", proof: "deferred:test:packages/cli/tests/ui-command.test.ts", sources: [S5] }
  - { id: A3, statement: "on the bare install, amy ui opens text and nothing was installed for it", proof: "deferred:assertion:bare.a_window_needs_no_install", sources: [S3, S6] }
  - { id: A4, statement: "two plugins contributing the same renderer name are refused at boot, naming both", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S2] }
  - { id: A5, statement: "a renderer declaring a surface frame.yaml does not define is refused at boot, and one declaring defined surfaces mounts with no edit to the frame", proof: "deferred:test:packages/cli/tests/ui-command.test.ts", sources: [S2] }
  - { id: A6, statement: "every installed renderer, the menu bar's included, is driven by the frame's script, found through ui-renderer", proof: "deferred:assertion:frame.every_installed_renderer_is_measured", sources: [S10, S11] }
  - { id: A7, statement: "for any two sets of mounted plugins, amy ui build gives byte-identical output", proof: "deferred:property:packages/cli/tests/ui-build.property.test.ts#a_mounted_plugin_reaches_the_build", sources: [S7, S8, S9] }
  - { id: A8, statement: "one built app shows a plugin installed after the build, page included, and drops it when removed, without being rebuilt", proof: "deferred:assertion:window.a_plugin_needs_no_rebuild", sources: [S7, S8] }
  - { id: A9, statement: "ui.menubar names the one renderer that draws the menu bar; a second menu bar renderer is installed but not started", proof: "deferred:test:packages/cli/tests/ui-command.test.ts", sources: [S10] }
  - { id: A10, statement: "a renderer named list, build, -x or anything outside [a-z][a-z0-9-]* is refused at mount naming the plugin and the name", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S4, S12] }
  - { id: A11, statement: "ui.default or ui.menubar naming no installed renderer, or one not declaring its surface, is refused at boot with the installed list", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S5, S13] }
  - { id: A12, statement: "a built app whose contract hash differs from the server's is told so by name and opens nothing stale", proof: "deferred:test:packages/cli/tests/ui-build.test.ts", sources: [S9] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A4, A5, A10" }
  - { mechanism: config, answer: works, proof: "deferred:A1, A9, A11" }
  - { mechanism: rendering, answer: works, proof: "deferred:A6, A8" }
guarantee:
  - { holds: "amy ui opens only a renderer an installed plugin contributes by name", not_against: "an installed renderer itself, which runs with the person's rights as every plugin does" }
  - { holds: "one build of an app serves every install and every plugin set", not_against: "a change to the SDK's contract, which asks for a new build and says so" }
  - { holds: "text opens on a bare install with no display", not_against: "a renderer needing a display or toolchain the machine lacks: its start or build fails as that tool does" }
cut:
  - "a flag per renderer on amy ui (--terminal, --desktop, --phone): refused; a renderer is chosen by name"
  - "a build per plugin set: refused; plugins arrive as data and served pages (S7, S8)"
  - "shipping any renderer but text with the CLI: refused; an install carrying Electron is a hundred megabytes nobody asked for"
exit: "bare install: amy ui opens text; the same desktop build, unrebuilt, shows a plugin installed after it; ui.menubar picks between two installed menu bar renderers, and the frame's script drives every one found by name"
---
# A renderer is chosen by name

A renderer is a plugin found by its name, the menu bar's included, so anyone
can write another. Each app is built once: what it shows comes from the
server, so a plugin never asks for a rebuild.
