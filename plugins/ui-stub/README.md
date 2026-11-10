# @amykit/plugin-ui-stub

Stub renderers, one in pixels and one in cells, that draw exactly the frame, and nothing else. Private: it is
never published, and exists so the conformance script has something to pass
before a real window does ([the frame is closed](../../docs/design/the-frame-is-closed.md)).

- `stub-desktop` lays out in pixels at 1280×800, the way a desktop window
  does.
- `stub-terminal` lays out in cells at 120×40, the way a terminal does, and
  abbreviates nav 1's labels by the frame's own rule when the terminal is
  narrow.

Neither has a screen. The layout engine is a few lines of arithmetic, and what
it laid out is what `read()` returns, which is all the harness measures in any
renderer. They agree with each other, which is the proof that a pixel and a
cell compare the same way.

The package names its module under `amy.conformance`, which is how the harness
finds a renderer in the workspace until *a renderer is chosen by name* lands.
