# A section can be seen another way

*The window takes plugins* lets a plugin add a section, a tab, an action and
a panel entry. None of those lets somebody see the work they already have in
a different way. `Work` is a list, and a list is the right default. Some people
would rather have a board by state, a dashboard of how long each state holds
its work, or an office where every record is somebody at a desk. herdr's
community already ships the last one,
[an office layout](https://github.com/zuccs/herdr-office-layout) where a
worker types while its agent runs and blinks *NEEDS YOU* when it is blocked.
In herdr that is a layout, and [a layout is the whole
window](https://herdr.dev/layouts/).

Here the frame stays closed (`docs/design/the-frame-is-closed.md`), so the
window keeps the same navigation, panel, palette and keys whatever is drawn
in the middle. What opens is the one region whose content is a matter of
taste: the canvas of a section, when nothing narrower is open in it.

## What changes

**A section has views, and the person picks one.** A plugin contributes to a
new collection, `ui-section-view`, naming the section it is a view of and the
view itself. The view is a function from the same snapshot slice the
section's default reads to a tree of primitives (`docs/design/a-view-is-data.md`).
The default ships and cannot be removed: `Work` is the list and
`Workflows` is the diagrams. The view in use is the person's, kept per section
in `config.yaml`:

```yaml
ui:
  views:
    work: office        # a ui-section-view a plugin contributed
    workflows: default
```

A view no plugin contributes is refused at boot by name, with the list of
those that are.

**A view only reads, and it acts through the frame's actions.** Clicking a
desk is `item.open` and the `⋯` on a worker is `item.menu`, the same intents
a row in the list sends. A view cannot name an action `frame.yaml` does not
list, so the office is never a road to a write the list does not have, and
`ui-action` keeps the only way to add one.

**A view says where it can be drawn.** A view declares the renderer
surfaces it holds, like a renderer does (*a renderer is chosen by name*). On a
renderer it does not hold, such as an office in a terminal, the section falls
back to its default and the header says which view was asked for and why it is
not shown. It never draws an empty canvas.

**The vocabulary gains the primitives a scene needs.** These are still data,
still semantic, and still drawn by the renderer:

- `Scene`: a fixed grid of cells that scales to the canvas.
- `Place`: a child at a cell, with a size in cells.
- `Sprite`: an image from the contributing package, served by the server
  like any other asset, with named frames. The frame shown is chosen by the
  record's standing (attention, active, waiting, finished) from *amy lives in
  the menu bar*. The renderer animates between frames, and the plugin runs no
  code in the window.

A pet, a clock that follows the time of day, or a worker who wanders while
its record waits are all frames and places chosen by the view from the
snapshot. Nothing in the renderer knows what an office is.

## The gates

`ui-frame` gains a scene view in its conformance world. The script switches
`Work` to it, opens a record by clicking it, and switches back, and the
regions around the canvas must project the same before, during and after.
`ui-window` installs a view from outside the workspace and asserts it appears
only once mounted. The refusals are unit tests on `mount()` and on the
vocabulary.

## Acceptance criteria

- [ ] Switching `Work` to a plugin's view changes the canvas and nothing else:
      every other region projects the same before and after
      (proof: deferred:assertion:frame.a_section_view_changes_only_the_canvas)
- [ ] Clicking a record in a scene view opens the same record, with the same
      canvas, as clicking its row in the list
      (proof: deferred:assertion:frame.a_scene_opens_what_the_list_opens)
- [ ] A view naming an action `frame.yaml` does not list is refused at boot,
      naming the view and the action
      (proof: deferred:test:packages/cli/tests/ui-plugins.test.ts)
- [ ] `ui.views` naming a view nothing contributes is refused at boot, with the
      installed list (proof: deferred:test:packages/cli/tests/ui-config.test.ts)
- [ ] A view on a renderer it does not hold falls back to the section's
      default and says so in the header
      (proof: deferred:assertion:frame.a_view_falls_back_where_it_cannot_be_drawn)
- [ ] An escalated record's sprite shows its attention frame with no `ui`
      block at all (proof: deferred:test:packages/ui/tests/scene.test.ts)
- [ ] `Scene`, `Place` and `Sprite` refuse a property they do not declare and
      a sprite frame that is not a standing
      (proof: deferred:test:packages/ui/tests/vocabulary.test.ts)
- [ ] A view installed with `amy plugin add` from outside the workspace
      appears only once mounted
      (proof: deferred:assertion:window.a_section_view_from_outside_appears_only_when_mounted)

**Exit condition:** a plugin written outside this repository contributes an
office view of `Work`, installed with `amy plugin add`. A person switches to it
in the desktop app, sees the escalated record's worker stand out, and opens
that record by clicking it. The same install in the terminal shows the list
and says why. Nothing outside the canvas moved.
