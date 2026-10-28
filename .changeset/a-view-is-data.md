---
"@amykit/ui": minor
"@amykit/cli": minor
---

**A view is data.**

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
