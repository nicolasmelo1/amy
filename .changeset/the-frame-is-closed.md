---
"@amykit/ui": minor
"@amykit/ui-conformance": minor
---

**The frame is closed.**

amy's window is about to be drawn by more than one renderer, and two renderers
drift apart without either being wrong. Before the first one exists, the
window is a locked file and every renderer is measured against it.

- `packages/ui/frame.yaml` is the closed wireframe as data: five regions and
  where each sits relative to the others, what each holds, the sections, the
  actions, a Neovim-style default keymap, the mouse, the surfaces a renderer
  may declare, the slots plugins add to, the narrowest window and the one
  rule by which a label may be abbreviated. It ships with `@amykit/ui`, which
  still depends on nothing, and is hash-locked.
- `@amykit/ui/frame` checks what it parses to (`checkFrame`), and reads keys in Neovim's
  notation: `buildKeymap` lays a person's `ui.keys` over the frame's and
  refuses, by name, a remap to an action the frame does not declare or two
  bindings a keypress cannot tell apart; `KeyReader` reads sequences, counts
  and the leader the way Neovim does. The renderer contract lives here too.
- New package `@amykit/ui-conformance`, and its `amy-ui-conformance` command,
  drive every
  renderer through a fixed script over a fixed world — by default keys, by a
  remapped keymap and by the mouse, and the default way twice — and read a
  projection out of what it laid out: regions, what each holds, and how each
  pair sits relative to each other, never a box. Eleven assertions hold it to
  the frame, to the other renderers and to the approved golden, naming the
  region, the relation or the first node that differs.
- Three local rules: `L0.A_RENDERER_ONLY_TRANSLATES`,
  `L0.A_RENDERER_NAMES_NO_COLOUR` and `L1.EVERY_RENDERER_HOLDS_THE_FRAME`.
