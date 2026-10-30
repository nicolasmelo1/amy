# A workflow is three pieces

[A workflow is one declaration](a-workflow-is-one-declaration.md)
gave every workflow one `defineWorkflow` call in place of two registrations,
a `required()` per port, a hand-merged policy and the core's half of the
record. What an author still hands it is the shape of the old contract:

- `states`, `waiting` and `terminal`, as lists in code, with the initial state
  being whichever comes first;
- one `plan` function that `switch`es on the state;
- one `runtime` function returning `found`, `observe`, `actions` and `apply`,
  built by hand from the ports.

The first is the diagram's to say ([a workflow is a Mermaid
diagram](a-workflow-is-a-mermaid-diagram.md)). The other two are where a
workflow's size still goes to things every workflow writes the same way: the
`switch`, the rules that hold for every state and are wrapped around it, and
the object the runtime assembles. amy is a framework for workflows the way
Rails is one for web applications, and a framework says where each thing goes.

## What changes

Like Rails, a workflow is three pieces, always in the same place:

| Rails | amy | What it says |
| --- | --- | --- |
| `routes.rb` | `workflow.mmd` | where work can go ([a workflow is a Mermaid diagram](a-workflow-is-a-mermaid-diagram.md)) |
| a controller | `decide` | where this piece of work goes next, given what the world says |
| models and jobs | `actions` | what happens in the world: an agent run, a branch, a message |

The window is the view, and it draws the same diagram. `defineWorkflow` takes
the last two pieces and derives everything else:

```ts
export default defineWorkflow({
  needs: { tasks: port<Tasks>(), agent: port<Harness>(), worktree: optional<Worktree>() },
  policy: { maxAttempts: 2, backoffMs: 60_000 },
  record: (workId) => ({ customer: workId }),
  observe: ({ ports }, work) => ({ task: ports.tasks.read(work.id) }),

  decide: {
    QUEUED: (work, world) => world.task ? advance("WORKING") : wait("nothing queued"),
    WORKING: (work, world) => act("run the task", { type: "run", prompt: world.task.text }),
    // one key per state the diagram draws
  },

  actions: {
    run: ({ ports }, work, effect) => ports.agent.run(effect.prompt),
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
  already do. Each receives the ports `needs` asked for, bound to the work:
  every reply from `agent` writes an `agent.run` line naming the work and its
  state, so the budget sees what it cost. Beside the ports an action gets
  `announce(text)`, a word to the operator whose failure becomes a
  `notify.failed` line instead of a failed action. `ports.notifier` stays
  strict, because a message the work depends on, such as a write handed to the
  operator, must fail the action when nobody heard it. The errand,
  note-to-plan and ticket-to-qa each wrote both duties by hand, and a workflow
  that forgot the first spent money the ceiling never counted.
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
- `advance`, `act`, `wait` and `settled` are exported by the core, typed by
  the workflow's own states and effects, so `planning<State, Effect>()` is no
  longer called by every workflow.
- What the delivered call already does stays: `needs` typed and refused by
  name, the policy merged and refused by key, the core's record fields, the
  deferred build, and write claims that may depend on the config.

**One file is where a workflow starts, not a rule.** A small workflow is
`workflow.mmd` and an `index.ts`. A large one splits into as many files as
its author wants: the private workflow's decisions are 1,700 lines and its actions
2,500, and they stay in their own files, imported into the one call. The
framework asks for the call and the diagram, and nothing else.

The three shipped workflows move onto it, and so does what `amy workflow new`
writes: a `workflow.mmd` and an `index.ts`. A raw `Plugin` that registers a workflow and its runtime by hand keeps
working, and the installed `workflow-oncall` fixture stays written that way, so
the gate that drives it keeps proving the contract underneath.

It comes after [a workflow is a Mermaid diagram](a-workflow-is-a-mermaid-diagram.md),
which gives `decide` the states it is checked against. The declarations
written against the delivered call keep mounting while each workflow moves:
`states`, `plan` and `runtime` are still accepted beside the new members, and
refused only together with them.

## Acceptance criteria

- [x] A workflow with a diagram declares no `states`, `waiting` or `terminal`,
      and its `decide` has one key per state the diagram draws: a missing or
      extra key is refused at boot by name
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] `before` answers ahead of every state's decision and `after` sees every
      decision, and the three compose into one pure `plan()`
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] `actions`, `remember`, `discover` and `observe` replace `runtime`, each
      receiving the typed ports, and a declaration that still passes `runtime`
      keeps mounting
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] The `agent` an action receives writes one `agent.run` for every reply,
      a failed agent still fails the action, `announce` turns a failed word
      into `notify.failed`, and `ports.notifier` stays strict
      (proof: test:packages/core/tests/action-ports.test.ts)
- [x] A workflow that also mounts a queue, a port with actions bound to its
      methods and a harness switched on by config does so through `extend`, in
      the same call
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] What `amy workflow new` writes is a `workflow.mmd` and an `index.ts`
      using the three pieces, and it runs before anybody edits it
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)
- [x] The three shipped workflows walk their scenarios unchanged
      (proof: assertion:plan.a_refused_draft_goes_back_to_the_agent)

**Exit condition:** the errand and note-to-plan are each a `workflow.mmd` and
one `defineWorkflow` call with `decide` and `actions`, with no `state.ts`,
`effects.ts` or separate runtime left; `ticket-to-qa`'s call adds only the
decisions that are its own; and every scenario the e2e script runs is green.

The implementation keeps the old declaration mode as an explicit pair:
`plan` and `runtime` still mount together, while any attempt to mix either
with the new members is refused at boot. Raw plugins remain below that layer
and continue to register both halves by hand. The shipped errand and
note-to-plan now split their source by the framework vocabulary —
`decide.ts` and `actions.ts` — and ticket-to-qa retains its public machine and
runtime exports while its declaration uses the same composition.
