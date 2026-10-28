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
| `ui-tab` | a tab in the canvas of a record, for the workflows and states it names | same name refused |
| `ui-panel` | a view in the right panel | same name refused |
| `ui-action` | an entry in a row's `⋯` | same name refused |
| `ui-decoration` | a badge on a row in nav 2 | several, ordered |
| `ui-menubar` | a line in the menu bar, under the work (*amy lives in the menu bar*) | same name refused |

Each contribution is a view from *a view is data*, plus the slice of the
snapshot it reads, so the host recomputes it only when that slice moves.

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

## Acceptance criteria

- [ ] A contribution lands only in the slot `frame.yaml` declares for its
      collection, in every renderer (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] Plugin sections come after `Work`, `Workflows` and `Settings`, whatever
      order they mounted in (proof: deferred:assertion:frame.the_fixed_sections_come_first)
- [ ] A canvas tab declared for one workflow appears on no other workflow's
      records (proof: deferred:assertion:window.a_tab_appears_only_where_it_is_declared)
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
section, a canvas tab and a `⋯` action, installed with `amy plugin add`, and
none of the three appears until it is mounted — and each lands in the same
place in the desktop app and the text renderer.
