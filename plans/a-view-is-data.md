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

## Why not a framework, and not a standard yet

**CopilotKit** solves a different problem: a copilot inside somebody's React
app, built from client-side components and hooks. It is the model this row
exists to refuse — a plugin that renders — and it has no terminal renderer.
Its human-in-the-loop is a pause inside the app; amy's is the work's thread,
which the window shows rather than replaces.

**A2UI** is close to this row's own answer, and standardised: an agent sends
declarative JSON, the client draws it from a catalogue of approved
components, custom catalogues are allowed, and renderers exist for several
platforms. Adopting it today would put an external, still-moving
specification under `frame.yaml` and the locked goldens — the site and the
repository do not yet agree on which version is current — and it has no
terminal renderer.

**AG-UI**, the event stream CopilotKit runs on, could carry `mod+k`'s ask. It
calls its own specification an unratified draft, and the sources do not agree
on how many event types it has.

So none of them is a dependency of this row, and the door stays open on
purpose:

- **The vocabulary is written to fit an A2UI catalogue.** Every primitive maps
  to one catalogue component with JSON-only properties, and no primitive needs
  a feature A2UI's catalogue model cannot express.
- **Exporting the tree is a later plugin, not a change here.** When A2UI
  reaches 1.0, a plugin translates the tree into it, against its schema
  vendored and watched the way `check:contracts` already watches the GitHub
  and Linear contracts — so an A2UI renderer, a phone included, becomes one
  more renderer *the frame is closed* measures.
- **AG-UI waits for ratification.** Until then the ask streams over the
  window's own socket.

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
- [ ] Every primitive's properties are JSON values only, so the vocabulary
      maps one to one onto a component catalogue
      (proof: deferred:test:packages/ui/tests/vocabulary.test.ts)
- [ ] Nothing under `packages/ui` depends on CopilotKit, A2UI or AG-UI
      (proof: deferred:test:packages/core/tests/architecture.test.ts)
- [ ] The same snapshot rendered twice is byte-identical text
      (proof: deferred:test:packages/ui/tests/text-renderer.test.ts)

**Exit condition:** `amy status` is rewritten as a view, and its text
rendering is the output `amy status` prints today, byte for byte.
