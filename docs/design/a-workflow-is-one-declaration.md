# A workflow is one declaration

A workflow is two halves, a pure `plan()` and a runtime, and keeping them apart
is [the most important thing about this codebase](../concepts/workflows.md).
Nothing here changed that. What changed is everything an author wrote to hand
the two halves to the host, which was more than either half:

- **Two registrations for one thing.** `registry.workflow(w)` and
  `registry.contribute(WORKFLOW_RUNTIME, w.name, runtime)`, by hand, matched by
  name. [Write a workflow](../build/write-a-workflow.md) called the missing
  second line "the first boot refusal nearly everybody meets", which was the
  API describing its own defect.
- **Ports asked for one at a time.** Each workflow wrote its own `required()`
  and called it per port, and cast the optional ones; the error message was
  rewritten per workflow.
- **A policy merged by hand.** A `policy` entry in the schema, then
  `{ ...DEFAULT_POLICY, ...ctx.config.policy }` in every workflow.
- **A record half written by the core.** `newRecord` set `id`, `updatedAt`,
  `attempts: {}` and `history: []` — the core's four fields — and then the
  `state` that `initialState` already named.
- **The same four helpers in every `effects.ts`.** `act`, `advance`, `wait`,
  `settled`, typed against the workflow's own states and effects.

`packages/workflow-errand/src/plugin.ts` was 143 lines and
`packages/workflow-note-to-plan/src/plugin.ts` 161, and nearly all of both was
that list, near-identical between the two. `ticket-to-qa`'s was 265, about half
of it the same list and the other half decisions that are genuinely its own.

This was not where the shipped workflows' size lived — `ticket-to-qa`'s machine
and runtime are each over seven hundred lines of its domain, and this touched
neither. It was where the cost of writing the *next* workflow lived.

## What changes

The core exports `defineWorkflow`:

```ts
export const plugin = defineWorkflow({
  name: "errand",
  pluginName: "@amykit/workflow-errand",
  states: ERRAND_STATES,
  waiting: WAITING_STATES,
  terminal: ["DONE", "DECLINED"],
  configSchema,
  policy: DEFAULT_POLICY,
  needs: {
    tasks: port<Tasks>(),
    agent: port<Harness>(),
    "code-host": port<CodeHost>(),
    notifier: port<Notifier>(),
    store: port<Store<ErrandRecord>>(),
    worktree: optional<Worktree>(),
  },
  codeHostWrites: ["open-pull-request"],
  plan,
  record: () => ({}),
  runtime: ({ ports, config, policy, checkouts, ctx }) =>
    errandRuntime({ tasks: ports.tasks, … }),
});

export const errand = plugin.workflow;
```

- One call registers the workflow and its runtime, under one name, so the pair
  cannot be half mounted. The declaration's `name` is the workflow's; the
  package name is `pluginName`, defaulting to `workflow-<name>`, because the
  two are different things and a config slice is keyed by the second.
- `needs` is the workflow's port list, typed. A required port nothing mounted
  is refused at boot naming the workflow and the port; an optional one arrives
  as `undefined`.
- The policy the runtime and `plan()` see is the declared defaults with the
  config's `policy` over them. A key the defaults do not have is refused at
  boot, by name, and a `policy` that is not a mapping is refused the same way.
- The core writes `id`, `state`, `updatedAt`, `attempts` and `history`; the
  workflow's `record` adds its own fields (`judged: []`, a `customer`) and
  nothing else, and `plugin.newRecord` is the constructor built from both.
- `runtime` is built through [a mount builds once](a-mount-builds-once.md), so
  there is no proxy, no `WeakMap` and no `ready` in a workflow at all. The
  runtime returns `WorkflowRuntimeParts` — everything but `policy` and
  `newRecord`, which the declaration supplies.
- The write claims may be a constant or a function of the validated config and
  merged policy, because `ticket-to-qa`'s `writes: operator` claims none; the
  function runs before `registry.workflow`, so the mount snapshot carries the
  attenuated claims.
- `runtimePolicy` is the one addition the plan did not name: `ticket-to-qa`'s
  runtime policy is not the merged policy — `conversation: discuss` with no
  conversation port degrades to `answer`, and `writes` is narrowed to the two
  values the workflow understands. The hook receives the ports so that
  decision stays the workflow's, and the runtime and the declaration cannot
  disagree about what the policy is.
- `planning<State, Effect>()` returns the four plan helpers, typed, so no
  workflow writes them.

The three shipped workflows moved onto it — `errand` and `note-to-plan` are a
config schema and one declaration, `ticket-to-qa`'s is those plus its write and
conversation modes, its roster reader and its progress budget — and so does
what `amy workflow new` writes. A raw `Plugin` that registers a workflow and
its runtime by hand keeps working, and the installed `workflow-oncall` fixture
stays written that way, so the gate that drives it keeps proving the contract
underneath.

The public workflow objects (`errand`, `noteToPlan`, `ticketToQa`) and the
`newRecord` exports survive as `plugin.workflow` and `plugin.newRecord`, so a
package that consumed them keeps compiling.

`workflow-feature-grooming` registers ports and no workflow, so this does not
apply to it; what to call it is for
[the docs describe the contract that exists](../../plans/the-docs-describe-the-contract-that-exists.md)
to raise.

It depends on [a mount builds once](a-mount-builds-once.md), reads better after
[a config is typed by its schema](a-config-is-typed-by-its-schema.md) and
[the host lends the checkout](the-host-lends-the-checkout.md), and ships in the
same release as [nothing is declared twice](nothing-is-declared-twice.md), so an
author migrates once.

## Acceptance criteria

- [x] A workflow whose required port nothing mounted is refused at boot naming
      the workflow and the port, and an optional one that is absent reaches the
      runtime as `undefined`
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] A policy key the defaults do not declare is refused at boot by name, and
      one left out keeps its default
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] A record a workflow starts carries the core's five fields without the
      workflow writing any of them
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] `ticket-to-qa` under `writes: operator` is still mounted claiming no
      writes, and refused any writer
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [x] What `amy workflow new` writes uses it, and still runs before anybody
      edits it
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)
- [x] A workflow registered by hand, without it, still mounts and is driven
      (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)
- [x] The three shipped workflows walk their scenarios unchanged
      (proof: assertion:plan.a_refused_draft_goes_back_to_the_agent)

**Exit condition:** the errand and note-to-plan `plugin.ts` each hold a config
schema and one `defineWorkflow` call; `ticket-to-qa`'s holds those plus only
the decisions that are its own — its write and conversation modes, its roster
and its progress budget; and every scenario the e2e script runs is green.
