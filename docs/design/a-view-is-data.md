# A view is data

Delivered. The record of this decision is this document; what proves it is
the unit suites of `@amykit/ui`, the byte-for-byte suite of `amy status`, and
`L0.A_VIEW_DRAWS_NOTHING` tripping on its fixture under `sf verify`. The plan
that came before kept the argument below; what it promised is the acceptance
criteria at the end.

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

## What changed

A new package, `@amykit/ui` (`packages/ui`), with no dependency at all — not
even the core, which is stricter than the plan's "the core only": nothing in
it needed anything the core has, and an unused dependency is one `knip`
refuses.

- **A closed vocabulary of primitives**, semantic rather than visual: `Stack`,
  `Row`, `Section`, `Text`, `Badge`, `List`, `Table`, `Tabs`, `Button`,
  `Link`, `Input`, `Timeline`, `StateMachine`, `Log`, `Code`, `Diff`, `Empty`
  (`packages/ui/src/vocabulary.ts`). Each declares its properties and what it
  holds — nothing, text, or other primitives — and `element` refuses a name
  outside the list, a property a primitive does not declare, and any value
  that is not JSON, naming what it refused. `validate` does the same for a
  tree that arrived as data, and says where in it the refusal was.
- **A view is a pure function** from a snapshot to a tree of those
  primitives. A tree is `{ type, props, children }` and nothing else, so it
  survives a socket, a file and `toEqual`.
- **JSX, without React.** The package is a `jsxImportSource`
  (`@amykit/ui/jsx-runtime`), so a plugin author writes the syntax they know
  and gets data back. A tag names a primitive or a function of its props
  returning one, which is how a view is split into smaller views. There are
  no intrinsic elements: a lowercase tag is a type error, and refused by name
  if it gets past the compiler.
- **An intent is data.** A `Button` carries `{ action: "poke", args: { workId } }`,
  never a closure, so it survives a socket and a phone. A closure in its
  arguments is refused as not JSON.
- **Diff and patch** (`packages/ui/src/diff.ts`): two trees in, a list of
  patches out — `replace`, `props`, `insert`, `remove` — so a renderer is sent
  what changed rather than the window again. Children are matched by
  position: a list that grows at the end costs one `insert`. Keyed matching
  can come when a renderer measures that it needs it.
- **A text renderer** (`packages/ui/src/text.ts`), for tests and for the
  terminal, deterministic — no clock, no width, no colour — so every view has
  a snapshot a test can assert.
- **The vocabulary as a catalogue.** `catalogue()` publishes one component
  per primitive with its properties as JSON Schema, which is the shape a
  declarative UI standard's catalogue takes.

Ephemeral state — which tab is open, what is typed in a box — is the
renderer's. Everything else is amy's, and comes in the snapshot. That is why
the text renderer draws `Tabs` as every tab: which one is open is a renderer's
business, and text has no cursor.

### `amy status` is a view

`statusView` (`packages/cli/src/status-page.tsx`) is a function of the very
snapshot `amy status --json` prints, plus whether `--all` was asked and where
the questions wait. The command draws it with the text renderer and prints
that, and its output is what it printed before, byte for byte —
`packages/cli/tests/status-page.test.ts` keeps the old printer verbatim as the
oracle and compares the two over every branch it had.

One thing in the old output had to become a property: a row with no
repository and no pull request ended in a trailing space after its standing,
because the old code trimmed only the last two columns. A `Table` column can
be `optional`, and from the first optional column on, a text line is not
padded past its last word — separator kept, which is what kept that space. It
is semantic rather than a quirk kept alive: an optional column is one a row
may leave blank, and a browser can hide it on a narrow screen.

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

So none of them is a dependency, and the door stays open on purpose:

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

`packages/core/tests/architecture.test.ts` holds the package to it: no
dependency beyond the core, and no import of any of the three.

## The rule

`L0.A_VIEW_DRAWS_NOTHING`, a local rule in `.software-factory/rules/`: **no
source under `packages/*/src` or `plugins/*/src` imports React, React DOM,
React Native, Ink, Preact, Vue, Solid or Svelte, or compiles its JSX against
one** — by import, `require`, dynamic `import`, a `@jsxImportSource` pragma or
a package's `tsconfig.json`. From here on nothing but a renderer plugin may
name a renderer; the first renderer plugin narrows the scope to leave itself
out, in the same pull request that adds it. Its mutation fixture is a view
importing `react`, and `sf verify` confirms the rule still catches it.

The text renderer is the first renderer the conformance script of *the frame
is closed* will measure.

## Acceptance criteria

- [x] A view written in JSX produces a tree of primitives with no React
      installed (proof: test:packages/ui/tests/jsx.test.ts)
- [x] A primitive outside the vocabulary is refused naming it
      (proof: test:packages/ui/tests/tree.test.ts)
- [x] Diffing two trees and applying the patches to the first yields the
      second, for every pair in the fixture corpus (proof: test:packages/ui/tests/diff.test.ts)
- [x] An intent round-trips through JSON unchanged
      (proof: test:packages/ui/tests/tree.test.ts)
- [x] A view importing `react` is refused, and the rule trips on its fixture
      under `sf verify` (proof: test:packages/ui/tests/a-view-draws-nothing.test.ts)
- [x] Every primitive's properties are JSON values only, so the vocabulary
      maps one to one onto a component catalogue
      (proof: test:packages/ui/tests/vocabulary.test.ts)
- [x] Nothing under `packages/ui` depends on CopilotKit, A2UI or AG-UI
      (proof: test:packages/core/tests/architecture.test.ts)
- [x] The same snapshot rendered twice is byte-identical text
      (proof: test:packages/ui/tests/text-renderer.test.ts)
- [x] `amy status` printed through the view is what it printed before, byte
      for byte, on every branch the old printer had
      (proof: test:packages/cli/tests/status-page.test.ts)

**Exit condition:** `amy status` is rewritten as a view, and its text
rendering is the output `amy status` prints today, byte for byte.
