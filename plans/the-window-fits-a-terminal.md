# The window fits a terminal

*amy has a window* draws in a browser. A person who lives in a terminal
should not have to leave it to see their work, and a window whose views are
data (*a view is data*) costs one renderer, not a second window.

## What changes

`amy ui --terminal` runs the same host in-process and draws it with Ink, the
React renderer for the command line. The frame is the same: nav 1 as a row of
sections, nav 2 as a list, the canvas, and the right panel toggled by a key.
`⌘K` is the same ask. Every primitive has a terminal drawing: `StateMachine`
as one line with the current state marked, `Diff` as a coloured unified diff,
`Timeline` as a list.

It also brings the terminal half of the opener *the workplace opens where
you work* ships for the browser: the window is suspended, the person's
`$EDITOR` or a shell runs in the record's checkout, and the window comes back
on the same record when it exits.

The renderer only translates primitives. It holds no view, no snapshot and no
rule a browser renderer does not also hold, so the two cannot disagree about
what a record says.

## The gates

This row is the one *the frame is closed* was written for: a second real
renderer. `plugins/ui-ink/src/**` joins `ui-frame`'s activation, the script
runs against the installed Ink plugin at 120×40, and the browser and terminal
projections are compared on every step.

## Acceptance criteria

- [ ] The terminal renderer holds the frame on every step of the script
      (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] The terminal and browser renderers agree on every region, on every step
      (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] Every primitive in the vocabulary has a terminal drawing, and a new one
      without it fails the build (proof: deferred:test:plugins/ui-ink/tests/primitives.test.ts)
- [ ] A plugin's canvas tab appears in the terminal with no change to the
      plugin (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] The editor opener suspends the window, starts in the record's checkout,
      and returns to the same record when the editor exits
      (proof: deferred:assertion:window.the_editor_returns_to_the_same_record)
- [ ] A plugin installed from outside the workspace lands in the same place in
      the terminal as in the browser (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] The narrowest width the frame allows still draws every region
      (proof: deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width)

**Exit condition:** a person runs `amy ui --terminal`, follows a record to
`ESCALATED`, discusses it in the right panel, decides, and opens its checkout
in `nvim` — without a browser — and the projection of every step is the
browser's.
