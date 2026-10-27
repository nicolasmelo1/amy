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

- **Terminal.** In the terminal renderer it suspends the window, runs the
  person's `$EDITOR` or a shell in the checkout, and resumes when it exits. In
  the browser it is a terminal in the canvas: xterm.js drawing, a PTY on the
  host, over the window's socket. That is a shell reachable from a browser, so
  it is its own plugin, never mounted by default, and refuses to start if the
  window is listening on anything but loopback.
- **Editors**: `code <path>` and `cursor <path>`, run on the host.
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
- [ ] The browser terminal refuses to mount when the host is not on loopback
      (proof: deferred:test:plugins/ui-terminal/tests/plugin.test.ts)
- [ ] In the terminal renderer, the editor opener returns to the same record
      when the editor exits (proof: deferred:assertion:window.the_editor_returns_to_the_same_record)

**Exit condition:** from one record, a person reads its diff in the window,
opens `nvim` on its checkout in the terminal, and a second person on the same
install opens the same checkout in VS Code — with neither of them typing a
path.
