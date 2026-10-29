# The window fits a terminal

*amy has a window* draws in a desktop app. A person who lives in a terminal
should not have to leave it to see their work, and a window whose views are
data (*a view is data*) costs one renderer, not a second window.

## What changes

`@amykit/ui-ink` contributes the renderer named `terminal`
(*a renderer is chosen by name*): `amy ui terminal` opens it, and `amy ui`
does once `ui.default` says so. It is a client like the desktop app
(*the window is served*) — it can follow a server on another machine — and
draws with Ink, the React renderer for the command line. The frame is the same: nav 1 as a row of
sections, nav 2 as a list, the canvas, and the right panel toggled by a key.
`⌘K` is the same ask. Every primitive has a terminal drawing: `Diff` as a
coloured unified diff, `Timeline` as a list, and `StateMachine` as the
workflow's diagram (*a workflow is a Mermaid diagram*). The diagram is drawn
from the states and edges the server parsed, never from Mermaid text:

- In a record's canvas it is the strip, one line with the current state
  marked.
- In the Workflows canvas it is each state with its edges beneath it,
  labelled, and the `anywhere` and `returns` states said in words.

No graph layout is drawn in characters. A Mermaid-to-ASCII library exists:
`beautiful-mermaid` draws a state diagram as box art. But it brings `elkjs`,
7.7 MB, for a picture that runs to sixty lines for seven states and merges two
opposite edges into one. If somebody wants it, it is a plugin's canvas tab
(*the window takes plugins*), not the terminal's own drawing.

A workflow's diagram is edited the way the editor opener works: `$EDITOR` on
its `workflow.mmd`, and the window saves it through the same check the desktop
canvas runs when the editor exits.

**It is driven like Neovim, and by the mouse.** A person who lives in a
terminal lives in its keybindings, and a window that makes them reach for
arrow keys is a window they close. The terminal answers the frame's modal
keymap (*the frame is closed*): `j`/`k` through a list, `h`/`l` between nav 2,
the canvas and the panel, `gg`/`G`, `/` to search, `:` for a command, counts,
sequences and a leader key — remappable in `ui.keys` with Neovim's own key
notation, the remap shared with the desktop app because it is the frame's, not
this renderer's. The one operator who asked for this named herdr as the feel:
a terminal app that is keyboard-first and still answers the mouse.

So the mouse works too. Ink has no mouse of its own, so the renderer turns on
the terminal's SGR mouse reporting (modes 1000/1006) when it starts, turns it
off when it exits or suspends, and translates clicks and the wheel into the
same frame actions a key reaches: a click on a row opens it, on a tab selects
it, on the panel's edge toggles it; the wheel scrolls the list or the canvas.
A terminal that reports no mouse leaves the keys exactly as they were.

It also brings the terminal half of the opener *the workplace opens where
you work* ships for the desktop app: the window is suspended, the person's
`$EDITOR` or a shell runs in the record's checkout, and the window comes back
on the same record when it exits.

The renderer only translates primitives. It holds no view, no snapshot and no
rule the desktop renderer does not also hold, so the two cannot disagree about
what a record says.

## The gates

This row is the one *the frame is closed* was written for: a second real
renderer. `plugins/ui-ink/src/**` joins `ui-frame`'s activation, the script
runs against the installed Ink plugin at 120×40 — by the default keys, by the
conformance remap and by SGR mouse sequences written to its input — and the
desktop and terminal projections are compared on every step.

## Acceptance criteria

- [ ] The terminal renderer holds the frame on every step of the script
      (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] The terminal and desktop renderers agree on every region, on every step
      (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] Every primitive in the vocabulary has a terminal drawing, and a new one
      without it fails the build (proof: deferred:test:plugins/ui-ink/tests/primitives.test.ts)
- [ ] A plugin's canvas tab appears in the terminal with no change to the
      plugin (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] The editor opener suspends the window, starts in the record's checkout,
      and returns to the same record when the editor exits
      (proof: deferred:assertion:window.the_editor_returns_to_the_same_record)
- [ ] A workflow's diagram edited in `$EDITOR` from the terminal is saved
      through the same check as the desktop canvas, and a refused one is not
      saved (proof: deferred:assertion:window.a_diagram_is_edited_as_text)
- [ ] A plugin installed from outside the workspace lands in the same place in
      the terminal as in the desktop app (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] The default keys, the conformance remap and the mouse drive the
      terminal to the same projections, step for step
      (proof: deferred:assertion:frame.keys_remaps_and_the_mouse_agree)
- [ ] Counts and sequences work as in Neovim: `5j` moves five rows, `gg` goes
      to the first (proof: deferred:test:plugins/ui-ink/tests/keymap.test.ts)
- [ ] Mouse reporting is on while the window runs, and off after it exits or
      suspends for an editor (proof: deferred:test:plugins/ui-ink/tests/mouse.test.ts)
- [ ] A terminal that reports no mouse still answers every key
      (proof: deferred:test:plugins/ui-ink/tests/mouse.test.ts)
- [ ] The terminal draws no menu bar, as its contribution declares
      (proof: deferred:assertion:frame.a_surface_is_drawn_only_where_declared)
- [ ] The narrowest width the frame allows still draws every region
      (proof: deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width)

**Exit condition:** a person runs `amy ui terminal`, follows a record to
`ESCALATED`, discusses it in the right panel, decides, and opens its checkout
in `nvim` — never touching the arrow keys, and clicking where a click is
quicker — and the projection of every step is the desktop app's.
