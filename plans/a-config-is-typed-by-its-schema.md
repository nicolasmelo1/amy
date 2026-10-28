# A config is typed by its schema

A plugin declares what its settings look like in a `ConfigSchema`, and the host
validates them against it at boot. Then the plugin reads them back as
`unknown` and casts:

```ts
timeoutMs: ctx.config.timeoutMs as number,
commands: ctx.config.commands as Record<string, string[]>,
```

There are 82 of those casts across 23 `plugin.ts` files, nine in the Slack
plugin alone and ten in `ticket-to-qa`. Each one restates, by hand, a type the
schema three lines above already declared. When the two disagree — a field
renamed in the schema and not at the cast, a `required` dropped so the value can
now be `undefined`, a `type: "number"` read `as string` — the compiler says
nothing, the host validates against one and the plugin reads the other, and the
first anybody hears of it is a setting that silently does nothing.

The host has done the hard half already. The type is the other half, and it is
free.

## What changes

- `ConfigOf<S>`, a type the core exports, maps a schema to the shape the host
  guarantees after validating it: `string`, `number`, `boolean`, `string[]`,
  and `Record<string, unknown>` for `record`. A field that is `required` or
  carries a `default` is present; any other is `| undefined`.
- `definePlugin({ configSchema, register, ready })` infers the schema from the
  literal and hands `register` and `ready` a context whose `config` is
  `ConfigOf<typeof configSchema>`. A plugin written as `const plugin: Plugin =
  {…}` still compiles exactly as before, so this is additive.
- A `default` whose type does not match its field's `type` fails to compile.
- Every shipped plugin and workflow moves onto it and deletes its casts.

`record` stays `Record<string, unknown>`. Giving it a value type would grow the
schema language, and [Plugins](../docs/concepts/plugins.md#config-schemas)
caps that language at five types on purpose; a plugin that needs a record of
strings narrows it once, in one named function, rather than at every read.

## Acceptance criteria

- [ ] A plugin reading a `number` field as a `string` fails to typecheck, and
      one reading an optional field without handling `undefined` does too
      (proof: deferred:test:packages/core/tests/config-schema.types.test.ts)
- [ ] A `default` of the wrong type fails to typecheck
      (proof: deferred:test:packages/core/tests/config-schema.types.test.ts)
- [ ] A plugin still written as `const plugin: Plugin = {…}` compiles and mounts
      unchanged
      (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)
- [ ] No shipped `plugin.ts` casts a scalar or `string[]` setting read off
      `ctx.config`
      (proof: test:packages/core/tests/architecture.test.ts)

**Exit condition:** `grep -rn "ctx.config\.[a-zA-Z]* as " plugins packages`
outside `dist/` finds only the narrowing of `record` fields, each inside one
named function.
