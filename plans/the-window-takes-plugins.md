# The window takes plugins

*amy has a window* ships a window nobody can extend. Every part of amy is a
plugin, and the window should be no different — but a window that any plugin
can rearrange is a window nobody recognises after the third install. So the
frame is fixed and the places a plugin can put something are named.

The mechanism exists already. `registry.contribute(collection, name, impl)`
is how a plugin adds to something another reads, and `mount()` refuses a
collision by name (`docs/concepts/plugins.md`). The window is five new
collections, not a new plugin model.

## What changes

| Collection | What a plugin adds | Collision |
| :-- | :-- | :-- |
| `ui-nav` | a section in nav 1, after the three that ship | same name refused |
| `ui-tab` | a tab in the canvas of a record, for the workflows and states it names — a state the named workflow does not have is refused by name, read from its diagram when it has one and from its declared `states` when it does not | same name refused |
| `ui-panel` | an entry in the right panel's rail, with a home view, a view for the open record, or both | same name refused |
| `ui-action` | an entry in a row's `⋯` | same name refused |
| `ui-decoration` | a badge on a row in nav 2 | several, ordered |
| `ui-menubar` | a line in the menu bar, under the work (*amy lives in the menu bar*) | same name refused |

Each contribution is a view from *a view is data*, plus the slice of the
snapshot it reads, so the host recomputes it only when that slice moves.

**The right panel works the way a mail client's side panel does.** Gmail
keeps one layout and lets add-ons open beside the mail: a rail of icons picks
which one is open, and each add-on has a *homepage*, shown whatever is open,
and *contextual* cards, shown for the thread that is open and dropped when the
person leaves it
([homepages](https://developers.google.com/workspace/add-ons/concepts/homepages)).
The add-on never touches the mail itself. That is the shape here:

- **The rail** is a strip at the window's right edge, visible while the panel
  is closed. It has one entry per `ui-panel` contribution, after the two that
  ship, `log` and `thread`. Choosing an entry opens the panel on it, and
  choosing the open one closes it. An entry names an icon from a closed set
  and a label; the terminal draws the label's first letter.
- **`home`** is the view an entry shows with no record open: a notebook, a
  calendar, the tickets waiting in the tracker. It reads the snapshot and no
  record.
- **`record`** is the view it shows for the open record. It is declared for
  the workflows and states it names, the way a `ui-tab` is, and an entry
  with no `home` is hidden from the rail on any other record. Opening
  another record swaps the record view and keeps the entry chosen.

An entry declares at least one of the two. `log` and `thread` are the two that
ship, each a `record` view, so the window looks exactly as *amy has a window*
draws it until a plugin adds an entry.

`frame.yaml` gains the `rail` region (`place: right, spans: full-height,
holds: [panel-entry]`), with the panel opening between the canvas and the
rail. It also gains the slot `panel.rail: { fixed: [log, thread], extended-by:
ui-panel }` in place of `panel`, and the actions `panel.next` and `panel.prev`
on `]p` and `[p`. A click on an entry is `panel.select`. This is an edit to a
locked file plus `sf lock`, in this row's pull request.

A whole new way of seeing a section, such as a board or an office, is not a
panel. That is *a section can be seen another way*.

**A `ui-action` declares what it writes**, the way a workflow declares
`trackerWrites` and `codeHostWrites`. One that reaches a mutating port without
claiming the capability is refused at boot, naming the action and the
capability. The window is never a second road to a write the config did not
allow.

**The three sections that ship cannot be replaced or removed**, only
reordered. A plugin that wants a whole page adds a section, it does not take
`Work` over.

## The gates

The conformance world already mounts one plugin contributing to every
collection (*the frame is closed*); this row makes it real. `ui-frame` asserts
where each contribution lands, `ui-window` asserts it arrives from an install,
and the refusals are unit tests on `mount()`.

## What it delivers

The `actions` domain — `listActions` and `runAction` — and plugin contributions in `listViews`, from *every endpoint is named before it is built*, flipped to
`delivered` in `surface.yaml` in the same pull request.

## Acceptance criteria

- [ ] What this row delivers is `delivered` in `surface.yaml`, and the surface
      gate is green (proof: deferred:test:packages/server/tests/surface.test.ts)

- [ ] A contribution lands only in the slot `frame.yaml` declares for its
      collection, in every renderer (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] Plugin sections come after `Work`, `Workflows` and `Settings`, whatever
      order they mounted in (proof: deferred:assertion:frame.the_fixed_sections_come_first)
- [ ] A canvas tab declared for one workflow appears on no other workflow's
      records (proof: deferred:assertion:window.a_tab_appears_only_where_it_is_declared)
- [ ] With no plugin mounted, the rail holds `log` and `thread` and the window
      projects as it did before this row (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] A panel entry with only a `home` view shows it with no record open, and
      keeps showing it when a record opens
      (proof: deferred:assertion:window.a_panel_home_needs_no_record)
- [ ] A panel entry's `record` view follows the open record, and an entry
      declared for one workflow is not on the rail for another's records
      (proof: deferred:assertion:window.a_panel_follows_the_open_record)
- [ ] A panel entry that declares neither view, or a state its workflow does
      not draw, is refused at boot by name
      (proof: deferred:test:packages/cli/tests/ui-plugins.test.ts)
- [ ] `]p` and `[p` walk the rail and a click on an entry opens it, in every
      renderer (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] Two plugins contributing the same name are refused at boot, naming both
      (proof: deferred:test:packages/core/tests/mount.test.ts)
- [ ] A `ui-action` reaching a mutation it did not claim is refused at boot
      (proof: deferred:test:packages/cli/tests/ui-plugins.test.ts)
- [ ] A contribution replacing `Work`, `Workflows` or `Settings` is refused
      (proof: deferred:test:packages/cli/tests/ui-plugins.test.ts)
- [ ] A view reading only the budget is not recomputed when a record moves
      (proof: deferred:test:packages/cli/tests/ui-plugins.test.ts)
- [ ] A plugin installed with `amy plugin add` from outside the workspace
      appears only once mounted (proof: deferred:assertion:window.a_plugin_from_outside_appears_only_when_mounted)

**Exit condition:** a plugin written outside this repository adds a nav 1
section, a canvas tab, a `⋯` action and a rail entry with a home and a record
view, installed with `amy plugin add`, and none of the four appears until it is
mounted. Each lands in the same place in the desktop app and the text
renderer, and the rail entry's record view changes when another record opens.
