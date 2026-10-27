# The frame is closed

amy is about to have a window drawn by more than one renderer — a browser
first, a terminal next, a phone some day — with plugins adding to it. Nothing
in this repository, nor in the factory that gates it, has ever had a window to
check. Every gate here observes an effect: a queue claims once, a push is a
fast-forward. None of them can say that the terminal put the work list on the
left and the browser put it on the right, and that is exactly how two
renderers drift: each one reasonable, together two products.

A screenshot comparison is the reflex, and it is not a gate. Fonts, hinting
and antialiasing differ by machine and by browser build, so a pixel diff is
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
keys:
  "mod+k": palette.open
  "mod+j": panel.toggle
  escape: close-topmost
  enter-in-thread: post-discussion       # never a decision
slots:
  canvas.tabs: { fixed: [timeline, diff], extended-by: ui-tab }
  nav2.row:    { extended-by: ui-decoration }
  nav2.menu:   { extended-by: ui-action }
  panel:       { extended-by: ui-panel }
```

It is in `L2.GENERATED_FILES_ARE_LOCKED`'s scope, beside `events.json`. Moving
a region, adding one or giving a key a second meaning is an edit plus an
`sf lock` in the same commit — a line in the diff somebody has to approve —
and `L2.POLICY_ONLY_TIGHTENS` refuses the commit that drops it from the scope.

## Every renderer is measured, not trusted

A **conformance world**: a fixed set of records in fixed states across two
profiles, a fixed clock, a fixed log, one plugin contributing one of each
collection. And a fixed **script** over it: start, select the escalated
record, toggle the panel, open the palette, press enter in the thread, open the
diff tab, resize to the narrowest width the frame allows.

After every step the harness — not the renderer — reads a **projection** out
of what the renderer actually laid out:

- **The browser** renders the built bundle in a pinned headless Chromium at a
  fixed viewport. Each region carries `data-amy-region`, each primitive
  `data-amy-primitive`; the harness reads their bounding boxes and the tree.
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
- [ ] The same script run twice yields byte-identical projections
      (proof: deferred:assertion:frame.a_projection_is_deterministic)
- [ ] Each of the four rules above trips on its fixture under `sf verify`
      (proof: deferred:test:sf verify over .software-factory/mutations)

**Exit condition:** with only `frame.yaml`, the conformance world and the
rules in place — no window yet — `sf verify` shows each rule tripping on its
broken renderer fixture, and a stub renderer that draws exactly the frame
passes the script twice with identical projections.
