# @amykit/ui

A view is data. A plugin does not render: it describes, and a renderer draws.

Not a renderer, and not a plugin. A closed vocabulary of primitives, a JSX
runtime that returns them as plain data, diff and patch between two trees,
the text renderer every view is tested with, and the closed frame every
renderer is measured against. It depends on nothing, React least of all
([a view is data](../../docs/design/a-view-is-data.md),
[the frame is closed](../../docs/design/the-frame-is-closed.md)).

## A view

A pure function from a snapshot to a tree:

```tsx
import { Button, Stack, StateMachine, Text, type Node } from "@amykit/ui";

export function workView(work: { id: string; state: string; states: string[] }): Node {
  return (
    <Stack gap={1}>
      <Text>{work.id}</Text>
      <StateMachine states={work.states} current={work.state} />
      <Button intent={{ action: "poke", args: { workId: work.id } }}>poke</Button>
    </Stack>
  );
}
```

with, in the package's `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@amykit/ui" } }
```

What comes back is `{ type, props, children }` all the way down, so it
crosses a socket and a test compares it with `toEqual`.

## What is here

- **The vocabulary** — `Stack`, `Row`, `Section`, `Text`, `Badge`, `List`,
  `Table`, `Tabs`, `Button`, `Link`, `Input`, `Timeline`, `StateMachine`,
  `Log`, `Code`, `Diff`, `Empty`. Anything else is refused by name, and so is
  any property value that is not JSON. `catalogue()` publishes it as one
  component per primitive, with JSON Schema properties.
- **`validate(tree)`** checks a tree that arrived as data before anything
  draws it.
- **`diff(before, after)` and `patch(tree, patches)`**, so a renderer is sent
  what changed rather than the window again.
- **`renderText(tree)`**, deterministic, which is what `amy status` prints.

A button's `intent` is an action named with JSON arguments, never a closure:
the thing that performs it is amy, not the renderer that drew the button.

## The frame

`frame.yaml`, beside this README, is the window as data: which regions exist,
where each sits relative to the others, what each holds and in what order,
and what each key and click does. It is hash-locked, together with the golden
projection approved from it and the conformance config in `conformance/`, and
all three ship with this package.

**`@amykit/ui/frame`** checks what the file parses to (`checkFrame`; this
package parses no YAML), reads keys in Neovim's notation (`parseKeys`), lays a
person's `ui.keys` over the frame's and refuses an undeclared action or an
ambiguous binding by name (`buildKeymap`), and reads sequences and counts the
way Neovim does (`KeyReader`). The contract a renderer implements is here too,
because the primitives and the frame are all a renderer may import.

What measures a renderer against it is
[`@amykit/ui-conformance`](../ui-conformance/README.md).

## The rules

Local rules in `.software-factory/rules/`:

- `L0.A_VIEW_DRAWS_NOTHING` — no package or plugin source imports a renderer
  or compiles its JSX against one. Only a renderer plugin may name a renderer.
- `L0.A_RENDERER_ONLY_TRANSLATES` — a renderer imports no workflow, no plugin,
  and nothing of this package but the primitives and the frame.
- `L0.A_RENDERER_NAMES_NO_COLOUR` — a renderer spells no colour outside its
  theme-token file.
- `L1.EVERY_RENDERER_HOLDS_THE_FRAME` — every renderer in the workspace passes
  the conformance script.
