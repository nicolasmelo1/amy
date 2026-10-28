# The workplace opens where you work

Every record that changes code has a checkout: the `Worktree` port answers
where (`acquire`, `states` in `packages/core/src/ports/Worktree.ts`). To see
what an agent wrote today, a person finds the path, `cd`s into it and runs
`git diff`. The window should show it, and open it in whatever that person
works in — and that is where people disagree. One wants a terminal and
`nvim`; another wants VS Code, Cursor, or Claude Code opened on the checkout.

## What changes

**`Diff` is a canvas tab that ships.** The record's checkout against its base,
read-only, as a `Diff` primitive, so every renderer draws it — a phone
included.

**Opening the checkout is a collection, `ui-opener`.** An opener names
itself, the renderers it works in, and whether it needs the window to be on
the same machine as the checkout. The canvas offers the openers mounted and
able to run where the window is.

The ones that ship:

- **Terminal.** In the desktop app it is a terminal in the canvas: xterm.js
  drawing, over the protocol, a PTY the server runs in the checkout. That is a
  shell, so it is its own plugin, `@amykit/ui-shell`, and never mounted by
  default, and the server
  offers it only to a client that connected over loopback (*the window is
  served*) — a client through a tunnel never sees it. Its terminal-renderer
  half —
  suspending the window for `$EDITOR` and resuming on exit — ships with *the
  window fits a terminal*, because that renderer does not exist before it.
- **Editors**: `code <path>` and `cursor <path>`, run on the server's machine,
  so offered only to a loopback client, like the shell.
- **Claude Code**: `claude`, started in the checkout, in the terminal opener.

## The gates

`Diff` is a primitive, so `ui-frame` already measures it in every renderer.
The openers are `ui-window`'s: the conformance world's `$EDITOR` and `code`
are fake commands that record the directory they were started in and exit,
so "it opened the right checkout" is a line in a file.

## Acceptance criteria

- [ ] The `Diff` tab holds what `git diff <base>...` prints in the checkout
      (proof: deferred:test:packages/cli/tests/ui-diff.test.ts)
- [ ] The diff tab is the second fixed tab in every renderer
      (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] Each opener is started in the record's checkout
      (proof: deferred:assertion:window.an_opener_starts_in_the_checkout)
- [ ] An opener that needs the host is not offered in a window on another
      machine (proof: deferred:test:packages/cli/tests/ui-openers.test.ts)
- [ ] The terminal opener is offered only when its plugin is mounted, only
      in the desktop app, and only over loopback (proof: deferred:test:plugins/ui-shell/tests/plugin.test.ts)

**Exit condition:** from one record, a person reads its diff in the window,
opens `nvim` on its checkout in the app's terminal, and a second person on the same
install opens the same checkout in VS Code — with neither of them typing a
path.
