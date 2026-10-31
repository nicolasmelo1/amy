# @amykit/ui

## 0.7.0

### Minor Changes

- 6091a45: **A view is data.**
  
  amy is going to have a window — a terminal, a browser, eventually a phone —
  with plugins changing what is in it. A plugin that exports React components
  renders in one of those and none of the others, cannot reach a phone that
  installs no npm packages, and brings a second copy of React into somebody's
  window. So a plugin does not render: it describes, and the renderer draws.
  
  - A new package, `@amykit/ui`, with no dependencies: a closed vocabulary of
    seventeen semantic primitives, checked so a name outside it — or any
    property value that is not JSON — is refused by name; a JSX runtime
    (`jsxImportSource: "@amykit/ui"`) that returns a tree of plain data with
    no React anywhere; `diff` and `patch` between two trees; `validate` for a
    tree that arrived as data; `catalogue()`, the vocabulary as JSON Schema
    components; and `renderText`, a deterministic text renderer.
  - A button's `intent` is `{ action, args }`, never a closure, so it survives
    a socket.
  - `amy status` is a view of the snapshot `amy status --json` prints, drawn by
    the text renderer. Its output is what it printed before, byte for byte.
  - A new local rule, `L0.A_VIEW_DRAWS_NOTHING`: no package or plugin source
    imports React, Ink, Preact, Vue, Solid or Svelte, or compiles its JSX
    against one.
- 7d2dd00: **A workflow is a Mermaid diagram.** A workflow's shape is the `workflow.mmd` beside it — an ordinary `stateDiagram-v2` that GitHub and Obsidian render — and the host reads its states, start, waits and ends from it when the workflow mounts; `defineWorkflow`'s `states`, `waiting` and `terminal` are required only without one, and declaring both is refused at boot. `readDiagram`, `connects`, `markState`, `withDiagramBeside` and the `notWritten()` stub are in the core, Mermaid-checked against Pele in its tests. The engine logs a move the diagram does not draw as `workflow.undrawn_transition` and makes it anyway; the testkit fails one, and with `everyEdge` an arrow no world walks. `amy workflow new --from <file.mmd>` turns a diagram into a workflow that mounts with every decision a stub, `amy workflow check` lists the stubs and the arrows not walked, and `amy workflow export [--work <id>]` prints the diagram with a record's state marked. `StateMachine` takes an optional `diagram`. The three shipped workflows are each drawn as one and lose their state lists and their exported unmounted `errand`, `noteToPlan`, `ticketToQa` and `newRecord`; bind a plugin with `withDiagramBeside(plugin, entry)` instead. `ticket-to-qa` no longer asks a reviewer again on every look when nothing was pushed since they requested changes.
- b17f2af: **The frame is closed.**
  
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
