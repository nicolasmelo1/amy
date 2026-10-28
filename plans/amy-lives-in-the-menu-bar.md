# amy lives in the menu bar

Most of the time a person does not want amy's window. They want to know, at a
glance and without leaving what they are doing, whether anything needs them
and whether the work is moving — the way a build monitor or a sync client sits
in the menu bar. Opening a terminal for `amy status`, or a window for a list,
to learn that nothing needs them, is the interruption amy is meant to save.

## What changes

The desktop app *amy has a window* ships stays resident, and puts one item in
the menu bar — the macOS menu bar first, the system tray on Windows and Linux
when the app is built for them.

**The item says what needs the person, and nothing else, in its title**: the
count of records in an attention state, and a mark while any record is being
worked.

That count needs a word the core does not have. It knows a state is `waiting`
or `terminal` and nothing more (`standing` in `packages/cli/src/status-view.ts`),
so `ESCALATED` and `HUMAN_REVIEW` look alike — both waiting — though one waits
on its owner and the other on somebody else. So **a workflow may declare
`attentionStates`**: the states in which it waits on the person whose work it
is. Optional, so every workflow written so far mounts unchanged and simply has
none; `ticket-to-qa` declares `CLARIFYING` and `ESCALATED`. Every record then
has one of four standings — attention, active, waiting, finished — which the
menu bar counts and the window draws, and which *looks are configuration*
later colours. No count is no number.
When the handbrake is pulled, the item says so instead.

**Its menu is the work, grouped the way the window is:**

```
◉ 2 need you
  TKT-11  ESCALATED      ticket-to-qa   ›  open · poke
  TKT-30  CLARIFYING     ticket-to-qa   ›  open · poke
● 3 working
  TKT-22  IMPLEMENTING   $0.42 so far
  …
─────────────
Paused: no  ·  Pause all…
Open amy            mod+k  Ask…
```

Choosing a record opens the window on it. The actions in a record's submenu
are its row's `⋯` actions, the same functions, so the menu bar is never a
road the window is not. Deciding is not one of them: a decision happens in the
thread, beside the discussion it settles (*a conversation before the work*).

**It says when it cannot see.** The menu bar is a client of the server like
the window; when the server is unreachable, the title says so rather than
showing the last count it had.

**It moves on its own.** The menu is a view like any other, recomputed when
the event log says something changed, whether or not the window is open. A
record entering an attention state also raises a system notification,
configurable and on by default, which opens the window on that record.

**Plugins add to it** through a `ui-menubar` collection (*the window takes
plugins*): a line of their own under the work — a budget, a queue length —
drawn from the same primitives.

## The frame grows a surface

The menu bar is not a region of the window, and a native menu cannot draw
what a canvas can. So `frame.yaml` declares it as a second **surface**,
`menubar`, with its own closed subset of primitives — `Text`, `Badge`, `List`,
`Link`, `Button`. The desktop renderer declares it draws `menubar`; the
terminal does not, so its absence is a declaration the gate reads rather than
a disagreement it has to forgive.

## The gates

A native menu is data before it is pixels: the app hands the system a menu
template and a title. The harness reads both from the packaged app after every
step of the script — the title as text, the menu as a tree of items — and that
is the menu bar's projection, compared with the locked golden and with the
frame's subset like any region's. `ui-window` asserts the behaviour against
the daemon on the conformance world.

## What it delivers

No operation: the views `menubar.title` and `menubar.menu`, over the session stream, from *every endpoint is named before it is built*, flipped to
`delivered` in `surface.yaml` in the same pull request.

## Acceptance criteria

- [ ] What this row delivers is `delivered` in `surface.yaml`, and the surface
      gate is green (proof: deferred:test:packages/server/tests/surface.test.ts)

- [ ] The menu bar's projection holds the frame's `menubar` surface on every
      step of the script (proof: deferred:assertion:frame.the_menu_bar_holds_its_surface)
- [ ] A primitive outside the `menubar` subset is refused naming it
      (proof: deferred:test:packages/ui/tests/surfaces.test.ts)
- [ ] A workflow without `attentionStates` mounts unchanged
      (proof: deferred:test:packages/core/tests/mount.test.ts)
- [ ] The title counts exactly the records in an attention state, across every
      profile (proof: deferred:assertion:window.the_menu_bar_counts_what_needs_you)
- [ ] A record the daemon advances moves in the menu with the window closed
      (proof: deferred:assertion:window.the_menu_bar_moves_without_the_window)
- [ ] Choosing a record opens the window on that record
      (proof: deferred:assertion:window.a_menu_item_opens_its_record)
- [ ] A record's submenu offers its row's `⋯` actions and no decision
      (proof: deferred:assertion:window.the_menu_bar_is_no_other_road)
- [ ] A record entering an attention state raises one notification, and none
      when notifications are off (proof: deferred:assertion:window.attention_is_notified_once)
- [ ] An unreachable server is in the title, and no stale count is shown
      (proof: deferred:assertion:window.the_menu_bar_says_it_cannot_see)
- [ ] The pulled handbrake is in the title
      (proof: deferred:assertion:window.the_menu_bar_says_it_is_paused)

**Exit condition:** on a Mac, with the window closed, a ticket escalates; the
menu bar's count goes from 0 to 1 and a notification arrives; choosing it
opens the window on that ticket — and the menu bar's projection on every step
equals the locked golden.
