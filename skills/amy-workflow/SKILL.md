---
name: amy-workflow
description: >-
  Write a new amy workflow as its own package, so a way of working becomes
  something installed rather than something forked. Use when somebody
  describes a routine they want amy to drive — an on-call week, a review
  rotation, a private process at work — or asks to add a workflow, change one,
  or understand why a workflow is a plugin. Covers the two halves every
  workflow has, the seven things it must declare, how a profile is configured,
  and the walkthrough test that is the only proof it works.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, workflow, plugin, scaffolding, state-machine]
    related_skills: [amy, amy-develop]
---

# Writing a workflow

A workflow is a package. It says what happens next and how each step is done,
and amy drives it without knowing what any of it means. Nothing in amy's own
code names a workflow, so a new one is written, installed and configured —
never merged into this repository unless it belongs to everybody.

That matters most for the ones that cannot be shared. A process that names
your employer's tooling, a private feedback step, an on-call rota: those live
in a package of yours, versioned wherever you like, and amy mounts them the
same way it mounts its own.

## Ask first, then write

Do not scaffold from a one-line request. Four answers decide the shape, and
guessing them produces a state machine somebody has to argue with:

1. **What starts a piece of work?** Something in a tracker, a file somebody
   drops in a directory, a schedule, a webhook already writing to disk. This
   becomes `found()`.
2. **What are the steps, in order?** Name them as states. Five is usually
   plenty; a workflow with twelve is two workflows.
3. **Which steps wait on somebody else?** A wait is not a failure — it is a
   state that makes no move until the world moves. Those become
   `waitingStates`.
4. **What does each step actually do?** One handler per action. If a step is
   "an agent does it", it is one call to the `agent` port and the handler is
   four lines.

Then say the shape back in one paragraph and get it confirmed before writing
code. A workflow is cheap to write and expensive to run wrong.

## The two halves

**`plan()` is pure.** It takes the record, a snapshot of the world and the
policy, and returns what should happen. No I/O, no clock, no randomness — that
is what lets a whole lifecycle be driven in a test in milliseconds.

```ts
plan(record, observation, policy): Plan
```

A `Plan` is one of four: `act` (do these, stay here, look again straight
away), `advance` (move to that state, doing these on the way), `wait` (nothing
until the world moves), `settled` (terminal, queue nothing).

**The runtime is everything impure.** What the world looks like before
deciding, what each action does, and how what the actions produced folds back
into the record. All three are domain knowledge and none of them belongs in
an engine.

The engine folds the state, the attempt count and the history through
`applyPlan`. Your `apply()` folds the rest — it cannot fold what it does not
understand, which is why it is yours.

## What a workflow declares

```js
const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesActions: [],      // action names the plan may emit
  usesObservers: [],    // observation slices it reads
  plan: (record, observation, policy) => ({ ... }),
};

export const plugin = {
  name: "@acme/workflow-oncall",
  version: "1.0.0",
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", runtime(ctx));
  },
};
```

`usesActions` is declared as data so the mount can be refused when an action
has no port behind it. Naming an action nothing runs is refused at boot, by
name, rather than at the first tick that needs it.

The runtime contributes to `workflow-runtime` under the workflow's own name.
A workflow that registers itself and contributes no runtime mounts and then
refuses: *"contributed no runtime, so nothing here knows how to run its
actions"*. That message is the one you will see if you forget this line.

There is a working example of the whole shape, in about forty lines, at
`.software-factory/evidence/installed-plugins/workflow-oncall/index.js`.

## Making it drivable

A profile is an entry in `.amy/config.yaml`. The name is what goes after
`--workflow`, and it is also the directory the profile's state lives in:

```yaml
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
    plugins:                       # empty means the recommended set
      - "@acme/workflow-oncall"
      - "@amy/plugin-file-queue"
      - "@amy/plugin-file-store"
      - "@amy/plugin-serial-engine"
```

Then install the package where `amy` can resolve it and run
`amy --workflow oncall plugin list`. A plugin named and not installed is
refused at boot with the list of what is installed, so a typo is one line to
find.

Settings for the workflow go in its own slice, under `plugins:` keyed by
package name. Nothing about a third-party workflow belongs in amy's own config
vocabulary.

## The test that is the point

One walkthrough test that drives the whole lifecycle against a fake world,
asserting the states in order. Every workflow in this repository has one, and
it is the test that finds the bugs:

- the lifecycle walks in the order it claims
- one look makes at most one move
- it settles instead of spinning — drive it past the end and assert nothing
  changes
- a waiting state makes no move until the world moves

Unit-test `plan()` directly for the branches: it is pure, so a table of
`(record, observation) -> Plan` is the cheapest test in the repository.

## What not to do

- **Do not put I/O in `plan()`.** The moment it awaits anything, the lifecycle
  stops being testable in milliseconds and starts being testable in an
  afternoon.
- **Do not add a state for a failure that is a retry.** `attempts` is on the
  record and bounds every loop already.
- **Do not reach for a tracker, a code host or a shell from a handler.** Ask
  the port. A workflow that shells out is a workflow that only runs on the
  machine it was written on.
- **Do not fork an existing workflow to change two states.** Write the one you
  mean. They cost a file each, and a fork is a second thing to keep green.
