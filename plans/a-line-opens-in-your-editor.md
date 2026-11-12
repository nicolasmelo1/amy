---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: decision, said: "diff and code in the window are links to the person's editor rather than a richer view: VS Code, Cursor, Zed and Neovim, Neovim mostly from the terminal; chosen per person in config. Decided 2026-11-12" }
  - { id: S2, kind: reference, ref: "plans/the-workplace-opens-where-you-work.md", said: "Diff is a canvas tab drawing git diff <base>... as a Diff primitive; openers start in the record's checkout; host editors are offered only on the local socket" }
  - { id: S3, kind: code, ref: "packages/ui/src/vocabulary.ts", said: "Diff declares no properties and Code only language; both hold text, so nothing says which file or line a line is" }
  - { id: S4, kind: reference, ref: "https://code.visualstudio.com/docs/configure/command-line", said: "vscode://file/{full path}:line:column opens a file at a position; code --goto file:line[:character] does from the command line" }
  - { id: S5, kind: reference, ref: "https://forum.cursor.com/t/does-cursor-have-a-unique-open-scheme/3659", said: "Cursor registers cursor://, and cursor://file/{path}:{line} opens a file at a line; community-reported, no official page" }
  - { id: S6, kind: reference, ref: "https://github.com/zed-industries/zed/blob/main/crates/zed/src/zed/open_listener.rs", symbol: "OpenRequest::parse", said: "Zed's open listener takes zed://file/ followed by a path with a line suffix, as its tests show; its CLI takes zed file:line:column" }
  - { id: S7, kind: reference, ref: "https://github.com/neovim/neovim/blob/master/runtime/doc/remote.txt", said: "Neovim has no URL scheme; nvim +{num} file starts at a line, and nvim --server {addr} --remote opens a file in a running instance listening there" }
  - { id: S8, kind: decision, said: "ui.editor names vscode, cursor, zed or nvim; ui.nvim.server, when set, opens in that running Neovim instead of a new one. Proposed 2026-11-12" }
  - { id: S9, kind: decision, said: "Diff gains root, the checkout's absolute path, and Code gains path and line; a renderer turns each diff line into its new-file line, and editorLink makes the link. Proposed 2026-11-12" }
  - { id: S10, kind: decision, said: "the desktop app opens the URL; the terminal renderer opens the URL with the system's opener, and Neovim by suspending into nvim +line, or with --remote when a server is set. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "a link is offered only where the checkout's path exists, as host editors are; elsewhere, a phone included, the line shows path:line to copy. Proposed 2026-11-12" }
touches:
  - packages/ui/src/vocabulary.ts
  - packages/ui/src/editor-link.ts
  - packages/ui/src/index.ts
  - packages/ui/tests/vocabulary.test.ts
  - packages/ui/tests/editor-link.test.ts
  - packages/ui/tests/editor-link.property.test.ts
  - packages/ui/tests/fixtures/editor-links.json
  - packages/cli/src/config.ts
  - packages/cli/tests/config.test.ts
  - packages/ui-conformance/src/world.ts
  - packages/ui-conformance/tests/conformance.test.ts
  - docs/start/configuration.md
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "editorLink gives, for one path, line and column, the golden link of each editor: vscode://file, cursor://file, zed://file, and the nvim argv with or without a server", proof: "deferred:test:packages/ui/tests/editor-link.test.ts", sources: [S4, S5, S6, S7, S8] }
  - { id: A2, statement: "for any path, spaces, # and % included, the link decodes back to exactly that path and line", proof: "deferred:property:packages/ui/tests/editor-link.property.test.ts#a_path_left_unencoded", sources: [S4, S5, S6] }
  - { id: A3, statement: "for any unified diff, each added or kept line maps to its line in the new file, and a removed line to none", proof: "deferred:property:packages/ui/tests/editor-link.property.test.ts#a_hunk_off_by_one", sources: [S3, S9] }
  - { id: A4, statement: "Diff takes root and Code takes path and line, and a value of the wrong type is refused naming it", proof: "deferred:test:packages/ui/tests/vocabulary.test.ts", sources: [S3, S9] }
  - { id: A5, statement: "ui.editor accepts vscode, cursor, zed or nvim, and anything else is refused at boot naming the four", proof: "deferred:test:packages/cli/tests/config.test.ts", sources: [S1, S8] }
  - { id: A6, statement: "on the fakes, a diff line clicked opens the configured editor at that file and line, and in the terminal nvim returns to the same record", proof: "deferred:assertion:window.a_line_opens_in_the_editor", sources: [S1, S2, S10] }
  - { id: A7, statement: "a window where the checkout's path does not exist offers no link and shows path:line", proof: "deferred:assertion:window.no_link_where_the_code_is_not", sources: [S2, S11] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A3, A4" }
  - { mechanism: config, answer: works, proof: "deferred:A5" }
guarantee:
  - { holds: "a link opens the file and line the diff showed", not_against: "the checkout moving on after the diff was drawn" }
  - { holds: "a link is offered only where the path exists", not_against: "an editor installed without its URL handler registered" }
failures:
  - { step: open, when: "the system has no handler for the editor's scheme", goes_to: "the window says so, naming ui.editor and the path:line" }
  - { step: nvim, when: "ui.nvim.server names a socket nothing listens on", goes_to: "a new nvim in the terminal, saying the server was not there" }
cut:
  - "a richer diff drawn in the window: the code is read in the editor (S1)"
  - "JetBrains and other editors: each is one more editorLink case when somebody asks"
exit: "a person with ui.editor set to cursor clicks a changed line in a record's diff and Cursor opens that file at that line; in the terminal, with nvim, the same line opens in nvim"
---
# A line opens in your editor

The diff tab shows what changed, but reading it properly means finding the
file yourself. Each line becomes a link to that file and line in the
person's editor: VS Code, Cursor, Zed or Neovim.
