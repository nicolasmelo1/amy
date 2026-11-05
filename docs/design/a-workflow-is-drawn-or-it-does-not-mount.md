# A workflow is drawn, or it does not mount

[A workflow is a Mermaid diagram](a-workflow-is-a-mermaid-diagram.md) and
[a workflow is three pieces](a-workflow-is-three-pieces.md) gave every
workflow its diagram, its decisions and its actions. They also left three
ways around them, and each one was a way for the diagram and the code to
disagree without anything breaking:

- A `defineWorkflow` with no `workflow.mmd` still mounted, with its states
  listed in code (`states`, `waiting`, `terminal`). Nothing held those lists
  to a drawing.
- The legacy declaration, a single `plan()` with a `runtime()` beside it,
  still mounted. The boot check of one decision per drawn state reads
  `decide`, so a `plan()` that `switch`ed past a drawn state passed.
- A raw plugin calling `registry.workflow` by hand still mounted from an
  install, with no diagram at all.

The shipped workflows had one more leftover from the migration. Each wrapped
its old runtime factory (`errandRuntime`, `planRuntime`, `ticketRuntime`) in a
`runtimeFor(scope)` memoised in a `WeakMap`, and routed every piece through
it. The memo held nothing, because the scope an action receives is a new
object each time, so every action rebuilt the whole runtime. In
`ticket-to-qa` the rebuilt runtime counted agent runs in a copy of its own,
switched off by hand so the core's count was not doubled.

## What changed

All three ways around are closed. Two gaps stay open on purpose. A
`notWritten()` stub still mounts. A move the diagram does not draw is still
made at runtime and logged as `workflow.undrawn_transition`, and the
walkthrough is what fails it.

- **No diagram, no mount.** `states`, `waiting` and `terminal` are gone from
  the declaration, and passing them is refused by name. A declaration whose
  host found no `workflow.mmd` is refused at mount, naming the workflow and
  the file it needs.
- **The legacy form is gone.** A declaration passing `plan` or `runtime` is
  refused at boot, naming where each moved: `plan` onto `decide`, one key per
  drawn state; `runtime` onto `discover`, `observe`, `actions` and
  `remember`. `decisionsFit` now judges every workflow.
- **amy mounts only declarations.** Every plugin the CLI loads goes through
  `drawn`, which wraps it in the core's `declaredWorkflowsOnly`, so a plugin
  calling `registry.workflow` by hand is refused, naming it. A raw
  `registry.workflow` remains the core's internal contract, used by its own
  and the engines' unit tests. The three installed `workflow-oncall`
  fixtures are now `defineWorkflow` declarations with a diagram beside them.
- **The pieces take the scope.** Errand, note-to-plan and ticket-to-qa write
  `discover`, `observe`, `remember` and every action against `scope.ports`,
  `scope.config`, `scope.policy`, `scope.checkouts`, `scope.ctx` and
  `scope.announce`. `errandRuntime`, `planRuntime` and `ticketRuntime` are
  removed, and ticket-to-qa's own agent-run accounting with them. The core's
  action ports write the one `agent.run` per reply.
- **The scaffold is the three pieces.** `amy workflow new` writes
  `workflow.mmd`, `decide.ts`, `actions.ts` and an `index.ts` holding the one
  `defineWorkflow` call. With `--from`, `decide.ts` holds a `notWritten()`
  stub per drawn state.

The opinion this enforces is written down in [MAD and BEP](../concepts/mad-and-bep.md).

## Deviations

- `amy add <path>` installs a copy of the package, with its dependencies,
  rather than a link to the original directory (`--install-links`), and
  probes it from amy's plugins folder. Every installed workflow now imports
  `@amykit/core` when it runs, and that import does not resolve from a link
  to a directory outside amy's plugins.
- The compile-time checks that `advance("LOST")` is a type error are gone.
  They inferred the state names from `states:`. A workflow types its states
  with `satisfies Record<State, Decision>` instead.
- The conformance world's personal profile still reaches the view with no
  diagram. Giving it one changes the approved golden, which is its own
  approval.

## Acceptance criteria

- [x] A declaration that still passes `plan` and `runtime` is refused at
      boot, naming where each moved
      (proof: test:packages/core/tests/define-workflow.test.ts)
- [x] A declaration whose host found no diagram is refused at mount, naming
      the workflow and the file, and one that still declares its states is
      refused naming the fields
      (proof: test:packages/core/tests/mount.test.ts)
      (proof: test:packages/cli/tests/loader.test.ts)
- [x] The CLI refuses a loaded plugin that registers a workflow by hand,
      naming it
      (proof: test:packages/cli/tests/loader.test.ts)
      (proof: test:packages/cli/tests/add.test.ts)
- [x] The scaffold writes `workflow.mmd`, `decide.ts`, `actions.ts` and
      `index.ts`, and runs before anybody edits it
      (proof: test:packages/cli/tests/scaffold.test.ts)
- [x] Errand, note-to-plan and ticket-to-qa carry no runtime factory, walk
      their scenarios unchanged, and ticket-to-qa writes one `agent.run` per
      agent reply
      (proof: test:packages/workflow-ticket-to-qa/tests/runtime.test.ts)
      (proof: test:packages/workflow-errand/tests/run-errand.test.ts)
      (proof: test:packages/workflow-note-to-plan/tests/runtime.test.ts)

**Exit condition:** no workflow amy mounts says its states anywhere but its
diagram, every drawn state has a decision checked at boot, and no shipped
workflow builds a runtime of its own around the scope it is handed.
