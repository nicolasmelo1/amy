# Declaring an action is implementing it

An action a workflow uses is declared three times, in three shapes, and the
thing that validates it is not the thing that runs it.

```ts
usesActions: ["hand-off-to-qa", ...]                          // a string
registry.action("merge", { port: REVV_FORGE, method: "merge" }, forge)  // a port and a method
handlers: () => ({ "merge": async (action, ctx) => { ... } })  // a function
```

The loader checks the second. `Worker.execute` reads only the third:

```
plugins/serial-engine/src/Worker.ts:415
  throw new Error(`no handler is mounted for the action "${action.type}"`)
```

So an action can be declared, pass the mount, be planned by a real state, and
have nothing behind it at the moment it runs. `hand-off-to-qa` was exactly
that in `@nicolasmelo1/workflow-revv` for its whole life: the core's table
names `tracker.setStatus` (`packages/core/src/actions.ts:52`), the tracker was
mounted, the loader was satisfied — and the last step of the happy path, the
one that hands a ticket to QA, would have thrown the first time any ticket
reached it. It never had, so nobody knew.

That is not a bug a careful author avoids. It is a bug the API invites: three
declarations of one fact, and no single place where they are compared.

## What changes

One declaration.

```ts
actions: {
  "hand-off-to-qa": async (action, ctx) => { ... },
  "merge": { port: REVV_FORGE, method: "merge" },
}
```

The key is the declaration, the value is the implementation — either a handler
or a port and method the host wires for you. `usesActions` is derived from the
keys, so the two cannot disagree; a `handlers()` entry nobody declared and a
declaration nobody implemented both stop being expressible.

The core's action table stays. What changes is that it can no longer stand in
for an implementation the engine will not reach.

## Acceptance criteria

- [ ] A workflow declaring an action with no implementation is refused at boot,
      naming the action (proof: assertion:mount.an_action_with_no_implementation_is_refused)
- [ ] A workflow whose plan emits an action it never declared is refused at
      boot (proof: assertion:mount.an_undeclared_action_is_refused)
- [ ] Every declared action is reachable by the engine's dispatch
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [ ] A port-and-method declaration is wired without the workflow writing a
      handler (proof: test:packages/core/tests/mount.test.ts)
- [ ] Both shipped workflows drive a ticket end to end on the new shape
      (proof: test:.software-factory/evidence/ticket-to-qa-scenario.sh)

**Exit condition:** an action cannot be declared without being implemented, and
the check that says so happens at boot rather than at the first tick that
reaches it.
