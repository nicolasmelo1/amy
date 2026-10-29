# A workflow is one declaration

A workflow is two halves, a pure `plan()` and a runtime, and keeping them apart
is [the most important thing about this codebase](../docs/concepts/workflows.md).
Nothing here changes that. What changes is everything an author writes to hand
the two halves to the host, which today is more than either half:

- **Two registrations for one thing.** `registry.workflow(w)` and
  `registry.contribute(WORKFLOW_RUNTIME, w.name, runtime)`, by hand, matched by
  name. [Write a workflow](../docs/build/write-a-workflow.md) calls the missing
  second line "the first boot refusal nearly everybody meets", which is the
  API describing its own defect.
- **Ports asked for one at a time.** Each workflow writes its own `required()`
  and calls it per port, and casts the optional ones; the error message is
  rewritten per workflow.
- **A policy merged by hand.** A `policy` entry in the schema, then
  `{ ...DEFAULT_POLICY, ...ctx.config.policy }` in every workflow.
- **A record half written by the core.** `newRecord` sets `id`, `updatedAt`,
  `attempts: {}` and `history: []` — the core's four fields — and then the
  `state` that `initialState` already names.
- **The same four helpers in every `effects.ts`.** `act`, `advance`, `wait`,
  `settled`, typed against the workflow's own states and effects.

`packages/workflow-errand/src/plugin.ts` is 143 lines and
`packages/workflow-note-to-plan/src/plugin.ts` 161, and nearly all of both is
that list, near-identical between the two. `ticket-to-qa`'s is 265, about half
of it the same list and the other half decisions that are genuinely its own.

This is not where the shipped workflows' size lives — `ticket-to-qa`'s machine
and runtime are each over seven hundred lines of its domain, and this touches
neither. It is where the cost of writing the *next* workflow lives.

## What changes

Like Rails, a workflow is three pieces, always in the same place:

| Rails | amy | What it says |
| --- | --- | --- |
| `routes.rb` | `workflow.mmd` | where work can go ([a workflow is a Mermaid diagram](a-workflow-is-a-mermaid-diagram.md)) |
| a controller | `decide` | where this piece of work goes next, given what the world says |
| models and jobs | `actions` | what happens in the world: an agent run, a branch, a message |

The window is the view, and it draws the same diagram. The core exports
`defineWorkflow`, which takes the last two pieces and derives everything else:

```ts
export default defineWorkflow({
  needs: { tasks: port<Tasks>(), agent: port<Harness>(), worktree: optional<Worktree>() },
  policy: { maxAttempts: 2, backoffMs: 60_000 },
  record: (workId) => ({ customer: workId }),
  observe: ({ ports }, work) => ({ task: ports.tasks.read(work.id) }),

  decide: {
    QUEUED: (work, world) => world.task ? advance("WORKING") : wait("nothing queued"),
    WORKING: (work, world, policy) => act("run", { prompt: world.task.text }),
    // one key per state the diagram draws
  },

  actions: {
    run: ({ agent }, work, effect) => agent.run(effect.prompt),
  },
});
```

- **The name and the shape come from where it lives.** A directory under
  `~/.amy/workflows` is named by the directory, and a package is named by its
  manifest. The states come from the diagram beside the workflow, so a
  workflow with a diagram declares no `states`, `waiting` or `terminal`.
- **`decide` has one key per state.** It is `plan()` split at the `switch`
  every workflow already writes. A state the diagram draws without a key, or a
  key for a state it does not draw, is refused at boot by name, the way Rails
  refuses a route with no action. That boot refusal takes over from the
  compiler's exhaustive `switch`. A single `plan` function is still accepted
  for a workflow that wants one.
- **`before` and `after` are the rules for every state,** like Rails'
  `before_action` and `after_action`:
  - `before` returns a plan or nothing, and runs ahead of the state's
    decision. A pull request merged by hand from any state, a stack base not
    ready, a ticket descoped: each is checked once rather than in every case.
  - `after` receives the decision and returns it, possibly changed. Hold
    anything that needs the tree while another piece of work is in it; commit
    what is loose before any advance.

  The private workflow amy runs at work already writes both, as functions wrapped around its
  `switch`, and its comments say why: "a guard per state is a guard somebody
  forgets; a filter over the effects cannot be". The purity is unchanged:
  `before`, the state's decision and `after` compose into the one pure
  `plan()` the host already calls.
- **`actions` declare and implement at once,** as the runtime's `actions`
  already do. Each receives the ports `needs` asked for.
- **`remember` folds what the actions produced into the record,** given the
  record, the outcomes, the observation and the move. It is the runtime's
  `apply`, renamed for what it does. A workflow that keeps nothing beyond the
  core's fields leaves it out.
- **`discover` and `observe` are the runtime's `found` and `observe`,**
  receiving the ports.
- **`extend` is the rest of the plugin.** It is the `register` a workflow
  package still needs for what is not a workflow: a priority queue, a port
  of its own and the actions bound to its methods, a harness switched on by
  config. That private workflow mounts all four. Without `extend` it could not move.
- One call registers the workflow and its runtime, under one name, so the pair
  cannot be half mounted.
- `needs` is the workflow's port list, typed. A required port nothing mounted
  is refused at boot naming the workflow and the port; an optional one arrives
  as `undefined`.
- The policy every piece sees is the declared defaults with the config's
  `policy` over them. A key the defaults do not have is refused at boot, by
  name, the way an unknown setting already is.
- The core writes `id`, `state`, `updatedAt`, `attempts` and `history`; the
  workflow's `record` adds its own fields and nothing else.
- It is built through [a mount builds once](../docs/design/a-mount-builds-once.md), so
  there is no proxy, no `WeakMap` and no `ready` in a workflow at all.
- The write claims may be a function of the config, because `ticket-to-qa`'s
  `writes: operator` claims none — the one place a claim is not a constant.
- `advance`, `act`, `wait` and `settled` are exported by the core, typed by
  the workflow's own effects, so no workflow writes them.

**One file is where a workflow starts, not a rule.** A small workflow is
`workflow.mmd` and an `index.ts`. A large one splits into as many files as
its author wants: the private workflow's decisions are 1,700 lines and its actions
2,500, and they stay in their own files, imported into the one call. The
framework asks for the call and the diagram, and nothing else.

The three shipped workflows move onto it, and so does what `amy workflow new`
writes. A raw `Plugin` that registers a workflow and its runtime by hand keeps
working, and the installed `workflow-oncall` fixture stays written that way, so
the gate that drives it keeps proving the contract underneath.

`workflow-feature-grooming` registers ports and no workflow, so this does not
apply to it; what to call it is for
[the docs describe the contract that exists](the-docs-describe-the-contract-that-exists.md)
to raise.

It comes after [a workflow is a Mermaid diagram](a-workflow-is-a-mermaid-diagram.md),
which gives `decide` the states it is checked against. It depends on [a mount builds once](../docs/design/a-mount-builds-once.md), reads better after
[a config is typed by its schema](../docs/design/a-config-is-typed-by-its-schema.md) and
[the host lends the checkout](../docs/design/the-host-lends-the-checkout.md), and ships in the
same release as [nothing is declared twice](../docs/design/nothing-is-declared-twice.md), so an
author migrates once.

## Acceptance criteria

- [ ] A workflow whose required port nothing mounted is refused at boot naming
      the workflow and the port, and an optional one that is absent reaches the
      runtime as `undefined`
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] A policy key the defaults do not declare is refused at boot by name, and
      one left out keeps its default
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] A state the diagram draws with no decision, or a decision for a state it
      does not draw, is refused at boot by name
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] `before` answers ahead of every state's decision and `after` sees every
      decision, and the three compose into one pure `plan()`
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] A workflow that also mounts a queue, a port with actions bound to its
      methods and a harness switched on by config does so through `extend`, in
      the same call
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] A record a workflow starts carries the core's five fields without the
      workflow writing any of them
      (proof: deferred:test:packages/core/tests/define-workflow.test.ts)
- [ ] `ticket-to-qa` under `writes: operator` is still mounted claiming no
      writes, and refused any writer
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] What `amy workflow new` writes uses it, and still runs before anybody
      edits it
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)
- [ ] A workflow registered by hand, without it, still mounts and is driven
      (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)
- [ ] The three shipped workflows walk their scenarios unchanged
      (proof: assertion:plan.a_refused_draft_goes_back_to_the_agent)

**Exit condition:** the errand and note-to-plan are each a `workflow.mmd` and
one `defineWorkflow` call, with no `state.ts`, `effects.ts` or `plugin.ts`
left; `ticket-to-qa`'s call adds only the decisions that are its own — its
write and conversation modes, its roster and its progress budget; and every
scenario the e2e script runs is green.
