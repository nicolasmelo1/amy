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

The core exports `defineWorkflow`:

```ts
export const plugin = defineWorkflow({
  name: "errand",
  states: ERRAND_STATES,
  waiting: ["QUEUED"],
  terminal: ["DONE", "DECLINED"],
  configSchema,
  policy: DEFAULT_POLICY,
  needs: { tasks: port<Tasks>(), agent: port<Harness>(), notifier: port<Notifier>(), worktree: optional<Worktree>() },
  plan,
  record: (workId) => ({ customer: workId }),
  runtime: ({ ports, config, policy, checkouts, ctx }) => errandRuntime({ … }),
});
```

- One call registers the workflow and its runtime, under one name, so the pair
  cannot be half mounted.
- `needs` is the workflow's port list, typed. A required port nothing mounted
  is refused at boot naming the workflow and the port; an optional one arrives
  as `undefined`.
- The policy the runtime and `plan()` see is the declared defaults with the
  config's `policy` over them. A key the defaults do not have is refused at
  boot, by name, the way an unknown setting already is.
- The core writes `id`, `state`, `updatedAt`, `attempts` and `history`; the
  workflow's `record` adds its own fields and nothing else.
- `runtime` is built through [a mount builds once](a-mount-builds-once.md), so
  there is no proxy, no `WeakMap` and no `ready` in a workflow at all.
- The write claims may be a function of the config, because `ticket-to-qa`'s
  `writes: operator` claims none — the one place a claim is not a constant.
- `planning<State, Effect>()` returns the four plan helpers, typed, so no
  workflow writes them.

The three shipped workflows move onto it, and so does what `amy workflow new`
writes. A raw `Plugin` that registers a workflow and its runtime by hand keeps
working, and the installed `workflow-oncall` fixture stays written that way, so
the gate that drives it keeps proving the contract underneath.

`workflow-feature-grooming` registers ports and no workflow, so this does not
apply to it; what to call it is for
[the docs describe the contract that exists](the-docs-describe-the-contract-that-exists.md)
to raise.

It depends on [a mount builds once](a-mount-builds-once.md), reads better after
[a config is typed by its schema](a-config-is-typed-by-its-schema.md) and
[the host lends the checkout](the-host-lends-the-checkout.md), and ships in the
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

**Exit condition:** the errand and note-to-plan `plugin.ts` each hold a config
schema and one `defineWorkflow` call; `ticket-to-qa`'s holds those plus only
the decisions that are its own — its write and conversation modes, its roster
and its progress budget; and every scenario the e2e script runs is green.
