# @amykit/ui

A view is data. A plugin does not render: it describes, and a renderer draws.

Not a renderer, and not a plugin. A closed vocabulary of primitives, a JSX
runtime that returns them as plain data, diff and patch between two trees,
and the text renderer every view is tested with. It depends on nothing, React
least of all ([a view is data](../../docs/design/a-view-is-data.md)).

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

## The rule

`L0.A_VIEW_DRAWS_NOTHING`, a local rule in `.software-factory/rules/`: no
package or plugin source imports a renderer or compiles its JSX against one.
Only a renderer plugin may name a renderer.
