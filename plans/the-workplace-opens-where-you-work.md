---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Worktree.ts", said: "every record that changes code has a checkout, and the Worktree port answers where (acquire, states); today a person finds the path, cds into it and runs git diff" }
  - { id: S2, kind: friction, said: "people disagree where to open it: one wants a terminal and nvim, another VS Code, Cursor, or Claude Code on the checkout" }
  - { id: S3, kind: decision, said: "Diff is a canvas tab that ships: the record's checkout against its base, read-only, as a Diff primitive, so every renderer draws it, a phone included" }
  - { id: S4, kind: decision, said: "opening is a collection, ui-opener: an opener names itself, the renderers it works in, and whether the window must be on the checkout's machine; the canvas offers those mounted and able to run where the window is" }
  - { id: S5, kind: decision, said: "the embedded terminal, in the desktop app, is ghostty-web (libghostty-vt in WebAssembly, xterm.js's API) at a pinned version, drawing a PTY the server runs in the checkout. Decided 2026-11-05" }
  - { id: S6, kind: reference, ref: "plans/the-window-is-served.md", said: "the shell is offered only on the local socket, never over TCP, so a tunnelled client reaching the server from 127.0.0.1 with a valid token still never sees it" }
  - { id: S7, kind: decision, said: "editors: code <path> and cursor <path> run on the server's machine, so are offered only on the local socket, like the shell" }
  - { id: S8, kind: decision, said: "Diff is a primitive, so ui-frame already measures it in every renderer. The openers are ui-window's: the world's $EDITOR and code are fake commands recording the directory they started in, then exiting" }
  - { id: S9, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers the workplace domain (listOpeners, runOpener, openShell, writeShell, resizeShell, closeShell) and the view work.diff, flipped to delivered in surface.yaml in the same pull request" }
  - { id: S10, kind: reference, ref: "plans/a-record-is-seen-everywhere.md", said: "the terminal renderer's half of the terminal opener (suspend for $EDITOR, resume on exit) ships with that plan, not this one" }
  - { id: S11, kind: decision, said: "each harness is an opener its own plugin contributes: @amykit/plugin-claude opens claude, @amykit/plugin-codex opens codex, in the embedded terminal, in the checkout. Installed means offered; the core names no harness. Decided 2026-11-05" }
  - { id: S12, kind: decision, said: "the canvas has one 'Open in' control: the button opens the person's default, ui.opener in config.yaml; its menu lists every opener mounted and able to run where the window is. Decided 2026-11-05" }
  - { id: S13, kind: decision, said: "the diff opener opens the checkout against its base in the person's own diff tool (git difftool --dir-diff <base>...): code alone opens a clean tree, because amy has committed the work. Decided 2026-11-05" }
  - { id: S14, kind: decision, said: "each opener that runs in the embedded terminal gets a terminal of its own in the panel: opening Claude Code and then Codex on one record is two terminals, never one replacing the other. Decided 2026-11-05" }
  - { id: S15, kind: reference, ref: "https://github.com/coder/ghostty-web", said: "a web terminal on Ghostty's parser compiled to WebAssembly, around 400KB with no runtime dependencies, API-compatible with xterm.js; libghostty itself has no tagged version yet" }
touches:
  - packages/server/src/workplace/**
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - packages/cli/src/ui/**
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-diff.test.ts
  - packages/cli/tests/ui-openers.test.ts
  - plugins/ui-shell/**
  - plugins/claude/src/**
  - plugins/codex/src/**
  - packages/ui-conformance/src/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S9] }
  - { id: A2, statement: "the Diff tab holds what git diff <base>... prints in the checkout", proof: "deferred:test:packages/cli/tests/ui-diff.test.ts", sources: [S1, S3] }
  - { id: A3, statement: "the diff tab is the second fixed tab in every renderer", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S3, S8] }
  - { id: A4, statement: "each opener is started in the record's checkout", proof: "deferred:assertion:window.an_opener_starts_in_the_checkout", sources: [S2, S4, S7, S8] }
  - { id: A5, statement: "an opener that needs the host is not offered in a window on another machine", proof: "deferred:test:packages/cli/tests/ui-openers.test.ts", sources: [S4, S7] }
  - { id: A6, statement: "the terminal opener is offered only when its plugin is mounted, only in the desktop app, and only on the local socket; a tunnelled client with the token does not get it", proof: "deferred:test:plugins/ui-shell/tests/plugin.test.ts", sources: [S5, S6, S10, S15] }
  - { id: A7, statement: "with the claude and codex plugins mounted, the Open in menu lists both, and either opens its harness in a terminal of its own in the checkout; with neither mounted, neither is listed", proof: "deferred:assertion:window.a_harness_opener_arrives_with_its_plugin", sources: [S11, S14] }
  - { id: A8, statement: "the Open in button opens ui.opener, and a ui.opener naming an opener nothing mounted is refused at boot by name, with the list of those that are", proof: "deferred:test:packages/cli/tests/ui-openers.test.ts", sources: [S12] }
  - { id: A9, statement: "the diff opener starts the configured diff tool on the checkout against its base, and writes nothing to the checkout", proof: "deferred:test:packages/cli/tests/ui-openers.test.ts", sources: [S13] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A3" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "reads the path the Worktree port answers and runs git diff read-only; nothing here takes a lease, moves a branch or commits" }
  - { mechanism: agent-replies, answer: n/a, why: "a harness opener starts the harness's own command line for a person in a terminal; it sends no prompt through the agent port and parses no reply" }
  - { mechanism: config, answer: works, proof: "deferred:A8" }
guarantee:
  - { holds: "the shell, host editors and harness openers are offered only on the local socket", not_against: "a process running as the same user, which can read the token and start a shell anyway" }
  - { holds: "the Diff tab and the diff opener run read-only and write nothing to the checkout", not_against: "uncommitted changes, which git diff <base>... does not show" }
  - { holds: "each opener starts in the record's checkout", not_against: "a person's edits, or a harness they opened, racing the agent's run in the same checkout" }
cut:
  - "the terminal renderer's half (suspend the window for $EDITOR, resume on exit): ships with a-record-is-seen-everywhere (S10), the first slice that opens a record in the terminal"
  - "libghostty native (Metal) embedding: refused while the window is a webview; it is for a native app, if one is ever built"
  - "a harness opener for OpenCode or Pi: their own plugins contribute one the same way, when those plugins exist"
exit: "from one record, a person reads its diff, opens it in their diff tool, and opens Claude Code and then Codex in two terminals from one Open in menu, never typing a path"
---
# The workplace opens where you work

To see what an agent wrote today a person finds the checkout's path, `cd`s into it and runs `git diff`; the window should show it and open it in whatever that person works in.
