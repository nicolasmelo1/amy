# The frame is closed

amy is about to have a window drawn by more than one renderer — a desktop
app first, a terminal next, a phone some day — with plugins adding to it. Nothing
in this repository, nor in the factory that gates it, has ever had a window to
check. Every gate here observes an effect: a queue claims once, a push is a
fast-forward. None of them can say that the terminal put the work list on the
left and the desktop app put it on the right, and that is exactly how two
renderers drift: each one reasonable, together two products.

A screenshot comparison is the reflex, and it is not a gate. Fonts, hinting
and antialiasing differ by machine and by engine build, so a pixel diff is
either red for no reason or loosened until it is green for every reason. What
must not drift is not pixels. It is **which regions exist, where each sits
relative to the others, what each one holds and in what order, and what each
key does** — and all of that can be read from a renderer's own layout engine
deterministically.

## The frame is a file

`packages/ui/frame.yaml` is the closed wireframe, as data:

```yaml
version: 1
regions:
  nav2:    { place: left,  spans: full-height, holds: [search, list, groom] }
  nav1:    { place: top,   of: right-column,   holds: [section] }
  canvas:  { place: below, of: nav1,           holds: [header, machine, tabs, body] }
  panel:   { place: right, of: canvas, toggled: true, holds: [log, thread, plugin-panel] }
  palette: { place: overlay, opened-by: "mod+k", holds: [ask] }
sections:
  fixed: [work, workflows, settings]     # in this order unless config reorders
  extended-by: ui-nav                    # plugin sections come after the fixed
actions:                                 # what a key or a click can do
  [nav.next, nav.prev, nav.first, nav.last, focus.left, focus.right,
   section.next, section.prev, tab.next, tab.prev, item.open, item.menu,
   search, palette.open, panel.toggle, close-topmost, command,
   mode.insert, mode.normal, thread.post-discussion, thread.decide]
keys:                                    # the default keymap; config remaps it
  normal:
    j: nav.next
    k: nav.prev
    gg: nav.first
    G: nav.last
    h: focus.left
    l: focus.right
    "]s": section.next
    "[s": section.prev
    gt: tab.next
    gT: tab.prev
    "<CR>": item.open
    "<leader>m": item.menu
    /: search
    ":": command
    "<leader>p": panel.toggle
    "<C-k>": palette.open                # mod+k on the desktop
    i: mode.insert
    "<Esc>": close-topmost
  insert:                                # a composer has focus
    "<CR>": thread.post-discussion       # never a decision
    "<Esc>": mode.normal
  leader: "<Space>"
mouse:                                   # every mouse gesture is an action too
  click: { row: item.open, tab: tab.select, section: section.select }
  wheel: { list: nav.scroll, canvas: canvas.scroll }
  "click-edge": { panel: panel.toggle }
surfaces:
  window:  { renderers: [desktop, terminal, text] }
  menubar: { renderers: [desktop], holds: [Text, Badge, List, Link, Button] }
slots:
  canvas.tabs: { fixed: [timeline, diff], extended-by: ui-tab }
  nav2.row:    { extended-by: ui-decoration }
  nav2.menu:   { extended-by: ui-action }
  panel:       { extended-by: ui-panel }
```

**Navigation is Neovim's, and a person's own.** The keymap is modal the way
Neovim is: normal mode moves and acts, a focused composer is insert mode, and
sequences, counts (`5j`) and a leader key work as they do there. It is a
default, not a law: `ui.keys` in `config.yaml` remaps any key to any declared
action in Neovim's own key notation, and a remap to an action the frame does
not declare, or two keys bound ambiguously, is refused at boot by name. The
mouse reaches the same actions, so a click and a key can never disagree about
what a row does. The keymap belongs to the frame, not to a renderer: the
desktop app and the terminal answer the same keys the same way.

**A surface is a place the frame draws.** The window is one; the menu bar
(*amy lives in the menu bar*) is another, with its own closed subset of
primitives and only the renderers that have one. A renderer without a surface
says so in the frame, so the gate never has to forgive an absence.

It is in `L2.GENERATED_FILES_ARE_LOCKED`'s scope, beside `events.json`. Moving
a region, adding one or giving a key a second meaning is an edit plus an
`sf lock` in the same commit — a line in the diff somebody has to approve —
and `L2.POLICY_ONLY_TIGHTENS` refuses the commit that drops it from the scope.

## Every renderer is measured, not trusted

A **conformance world**: a fixed set of records in fixed states across two
profiles, a fixed clock, a fixed log, one plugin contributing one of each
collection. And a fixed **script** over it: start, select the escalated
record, toggle the panel, open the palette, press enter in the thread, open the
diff tab, resize to the narrowest width the frame allows — once driven by the
default keys, once by a remapped keymap from the conformance config, and once
by the mouse. The three runs must yield the same projections.

Once *the window is served* lands, the script reaches every renderer through
a server, and once *a renderer is chosen by name* lands, the harness finds the
renderers through the `ui-renderer` collection rather than a list of its own.

After every step the harness — not the renderer — reads a **projection** out
of what the renderer actually laid out:

- **The desktop app** is launched packaged, headless, at a fixed window size,
  and measured in its own Chromium — the engine that ships, the same on every
  platform. Each region carries `data-amy-region`, each primitive
  `data-amy-primitive`; the harness reads their bounding boxes and the tree.
  The menu bar's projection is the title and menu template the app handed the
  system.
- **The terminal** renders the built Ink plugin into a fixed 120×40 stream.
  The harness reads each region's computed Yoga box — the same layout engine
  React Native uses — in cells.

A projection is the regions with their boxes, the sections in nav 1 in order,
and per region the tree of primitives as type and text. Boxes are compared
**relationally** (nav 2 is left of the canvas and spans the full height; nav 1
is above the canvas; the panel is right of the canvas only while toggled), so
a pixel and a cell compare the same way and a font changes nothing.

Three things are asserted on every step, for every renderer:

1. **The frame holds** — every region in `frame.yaml` is drawn, none other is,
   each sits where it is declared, and every key does what it is declared to.
2. **The renderers agree** — the per-region trees are equal across renderers,
   after the one normalisation the frame allows (a terminal may abbreviate a
   label it cannot fit, by a rule in `frame.yaml`, never by its own).
3. **Nothing moved since it was approved** — the projection equals the golden
   one under `packages/ui/conformance/`, which is in the same lock scope as the
   frame. Changing the window is regenerating the golden and locking it.

## The rules came first

Like *an agent only answers*, the rules land before the first renderer, each
as a local rule in `.software-factory/rules/<name>.yaml` with a mutation
fixture `sf verify` shows tripping it. The three structural ones are layer 0
`text_pattern` rules; the last is a layer 1 `kind: command`:

| Rule | What it refuses |
| --- | --- |
| `a-view-draws-nothing` (lands earlier, with *a view is data*) | `react`, `react-dom`, `ink` or `react-native` imported anywhere but a renderer plugin |
| `a-renderer-only-translates` | a renderer importing a workflow, a plugin, or anything of `@amykit/ui` but the primitives and the frame |
| `a-renderer-names-no-colour` | a colour literal in a renderer outside its theme-token file |
| `every-renderer-holds-the-frame` | `kind: command` running the conformance script against every renderer in the workspace; its fixtures are a renderer with nav 2 on the right, one that never draws the panel, one where enter decides, and one plugin tab placed in nav 1 |

And one L3 gate, `ui-frame`, activated by `packages/ui/**`, `plugins/ui-*/src/**`
and the window host, whose scenario runs the script against the **installed**
renderers from another process, the way every other gate here proves the
artifact rather than the source.

## What this is not

It does not judge whether the window is good-looking, and it does not check
colour — *looks are configuration* makes that the person's. It checks that the
window is the window that was agreed, in every renderer, every time.

## Acceptance criteria

- [ ] Editing `frame.yaml` without `sf lock` in the same commit fails the
      build (proof: deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED)
- [ ] A renderer with nav 2 drawn on the right fails the conformance check,
      naming the region and the relation (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] A renderer that draws a region the frame does not declare fails
      (proof: deferred:assertion:frame.no_region_is_invented)
- [ ] A renderer whose enter in the thread posts a decision fails
      (proof: deferred:assertion:frame.every_key_does_what_it_is_declared_to)
- [ ] Two renderers whose canvas trees differ fail, naming the first node that
      differs (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] A projection that differs from the locked golden fails, and regenerating
      the golden is a locked edit (proof: deferred:assertion:frame.nothing_moved_since_it_was_approved)
- [ ] A plugin's tab lands in `canvas.tabs` after `timeline` and `diff`, and a
      plugin cannot put one anywhere else (proof: deferred:assertion:frame.a_slot_takes_only_what_it_declares)
- [ ] `Work`, `Workflows` and `Settings` come first in nav 1 in the order the
      config gives, and plugin sections after (proof: deferred:assertion:frame.the_fixed_sections_come_first)
- [ ] At the narrowest width the frame allows, every region is still drawn
      (proof: deferred:assertion:frame.no_region_is_lost_at_the_narrowest_width)
- [ ] The script driven by the default keys, by a remapped keymap and by the
      mouse yields the same projections in every renderer
      (proof: deferred:assertion:frame.keys_remaps_and_the_mouse_agree)
- [ ] A remap to an undeclared action, or an ambiguous binding, is refused at
      boot by name (proof: deferred:test:packages/ui/tests/keymap.test.ts)
- [ ] A renderer drawing a surface the frame does not give it fails
      (proof: deferred:assertion:frame.a_surface_is_drawn_only_where_declared)
- [ ] The same script run twice yields byte-identical projections
      (proof: deferred:assertion:frame.a_projection_is_deterministic)
- [ ] Each of the four rules above trips on its fixture under `sf verify`
      (proof: deferred:test:sf verify over .software-factory/mutations)

**Exit condition:** with only `frame.yaml`, the conformance world and the
rules in place — no window yet — `sf verify` shows each rule tripping on its
broken renderer fixture, and a stub renderer that draws exactly the frame
passes the script twice with identical projections.
