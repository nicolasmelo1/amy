---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Worktree.ts", said: "every record that changes code has a checkout, and the Worktree port answers where (acquire, states); today a person finds the path, cds into it and runs git diff" }
  - { id: S2, kind: friction, said: "people disagree where to open it: one wants a terminal and nvim, another VS Code, Cursor, or Claude Code on the checkout" }
  - { id: S3, kind: decision, said: "Diff is a canvas tab that ships: the record's checkout against its base, read-only, as a Diff primitive, so every renderer draws it, a phone included" }
  - { id: S4, kind: decision, said: "opening is a collection, ui-opener: an opener names itself, the renderers it works in, and whether the window must be on the checkout's machine; the canvas offers those mounted and able to run where the window is" }
  - { id: S5, kind: decision, said: "the terminal opener, in the desktop app, is xterm.js drawing through the SDK a PTY the server runs in the checkout; a shell, so its own plugin @amykit/ui-shell, never mounted by default" }
  - { id: S6, kind: reference, ref: "plans/the-window-is-served.md", said: "the shell is offered only on the local socket, never over TCP, so a tunnelled client reaching the server from 127.0.0.1 with a valid token still never sees it" }
  - { id: S7, kind: decision, said: "editors: code <path> and cursor <path> run on the server's machine, so are offered only on the local socket, like the shell. Claude Code: claude started in the checkout in the terminal opener" }
  - { id: S8, kind: decision, said: "Diff is a primitive, so ui-frame already measures it in every renderer. The openers are ui-window's: the world's $EDITOR and code are fake commands recording the directory they started in, then exiting" }
  - { id: S9, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers the workplace domain (listOpeners, runOpener, openShell, writeShell, resizeShell, closeShell) and the view work.diff, flipped to delivered in surface.yaml in the same pull request" }
  - { id: S10, kind: reference, ref: "plans/the-window-fits-a-terminal.md", said: "the terminal renderer's half of the terminal opener (suspend for $EDITOR, resume on exit) ships with that plan, not this one" }
touches:
  - packages/server/src/workplace/**
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - packages/cli/src/ui/**
  - packages/cli/tests/ui-diff.test.ts
  - packages/cli/tests/ui-openers.test.ts
  - plugins/ui-shell/**
  - packages/ui-conformance/src/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S9] }
  - { id: A2, statement: "the Diff tab holds what git diff <base>... prints in the checkout", proof: "deferred:test:packages/cli/tests/ui-diff.test.ts", sources: [S1, S3] }
  - { id: A3, statement: "the diff tab is the second fixed tab in every renderer", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S3, S8] }
  - { id: A4, statement: "each opener is started in the record's checkout", proof: "deferred:assertion:window.an_opener_starts_in_the_checkout", sources: [S2, S4, S7, S8] }
  - { id: A5, statement: "an opener that needs the host is not offered in a window on another machine", proof: "deferred:test:packages/cli/tests/ui-openers.test.ts", sources: [S4, S7] }
  - { id: A6, statement: "the terminal opener is offered only when its plugin is mounted, only in the desktop app, and only on the local socket; a tunnelled client with the token does not get it", proof: "deferred:test:plugins/ui-shell/tests/plugin.test.ts", sources: [S5, S6, S10] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A3" }
cut:
  - "the terminal renderer's half (suspend the window for $EDITOR, resume on exit): ships with the-window-fits-a-terminal (S10), since that renderer does not exist before it"
exit: "from one record, a person reads its diff in the window, opens nvim on its checkout in the app's terminal, and a second person on the same install opens it in VS Code, neither typing a path"
---
# The workplace opens where you work

To see what an agent wrote today a person finds the checkout's path, `cd`s into it and runs `git diff`; the window should show it and open it in whatever that person works in.
