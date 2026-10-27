# A view is data

amy is meant to have a window: one for a terminal, one for a browser, and
eventually one for a phone, with plugins changing what is in them. The obvious
way — a plugin exports React components — fails three ways at once:

- **The renderers share no primitives.** A terminal renderer has boxes and
  text, a browser has the DOM, a phone has native views. A component written
  for one does not render in another.
- **A phone does not install npm packages.** Whatever a plugin adds has to
  reach a compiled app as something it reads, not code it runs.
- **Two copies of React break hooks.** A plugin carrying its own React is the
  same two-copies failure *compatibility is a capability, not a version*
  describes for the core, and it fails with an error in a person's window
  rather than at boot.

So a plugin does not render. It describes, and the renderer draws — the model
Shopify's Remote DOM and Airbnb's server-driven UI arrived at for the same
reasons.

## What changes

A new package, `@amykit/ui`, depending on the core only:

- **A closed vocabulary of primitives**, semantic rather than visual: `Stack`,
  `Row`, `Section`, `Text`, `Badge`, `List`, `Table`, `Tabs`, `Button`,
  `Link`, `Input`, `Timeline`, `StateMachine`, `Log`, `Code`, `Diff`, `Empty`.
  Semantic is what lets a terminal draw `StateMachine` as a line of text and a
  browser draw it as a graph. The list is short on purpose, for the reason the
  config schema has five types.
- **A view is a pure function** from a snapshot to a tree of those
  primitives. Pure, like `plan()`, so it is tested with no I/O.
- **JSX, without React.** The package is a `jsxImportSource`, so a plugin
  author writes the syntax they know and gets data back.
- **An intent is data.** A `Button` carries `{ action: "poke", args: { workId } }`,
  never a closure, so it survives a socket and a phone.
- **Diff and patch**: two trees in, a list of patches out, so a renderer is
  sent what changed rather than the window again.
- **A text renderer**, for tests and for `--json`, so every view has a
  snapshot a test can assert.

Ephemeral state — which tab is open, what is typed in a box — is the
renderer's. Everything else is amy's, and comes in the snapshot.

## The gates

`a-view-draws-nothing` lands with this row, before the package has a line of
code, with a fixture that imports `react` from a view: from here on nothing
but a renderer plugin may name a renderer. The text renderer is the first
renderer the conformance script of *the frame is closed* will measure.

## Acceptance criteria

- [ ] A view written in JSX produces a tree of primitives with no React
      installed (proof: deferred:test:packages/ui/tests/jsx.test.ts)
- [ ] A primitive outside the vocabulary is refused naming it
      (proof: deferred:test:packages/ui/tests/tree.test.ts)
- [ ] Diffing two trees and applying the patches to the first yields the
      second, for every pair in the fixture corpus (proof: deferred:test:packages/ui/tests/diff.test.ts)
- [ ] An intent round-trips through JSON unchanged
      (proof: deferred:test:packages/ui/tests/tree.test.ts)
- [ ] A view importing `react` is refused, and the rule trips on its fixture
      under `sf verify` (proof: deferred:test:mutation fixture for a-view-draws-nothing)
- [ ] The same snapshot rendered twice is byte-identical text
      (proof: deferred:test:packages/ui/tests/text-renderer.test.ts)

**Exit condition:** `amy status` is rewritten as a view, and its text
rendering is the output `amy status` prints today, byte for byte.
