# @amykit/workflow-testkit

## 0.5.0

### Minor Changes

- f9cdd5e: `@amykit/workflow-testkit` is new: `conforms(workflow, { runner, runtime, worlds })` registers the machine-shaped suite every workflow needs and nobody writes — every state reached and left, every planned action handled and surviving the call, no wait counted as a try, no decision made by `[].every(...)`, and no giving-up state without an honest way out — as ordinary tests in whichever runner it is handed, driven against worlds the author supplies. `amy workflow new` now writes that suite beside the scaffold as `index.test.js`, with `npm test` and the kit as a dev dependency, and the scaffold's `index.js` exports its `workflow` and a `runtime()` factory beside the plugin.
- 98cc10e: **Breaking for workflow authors — one migration for two changes.**
  
  An action is declared once. `WorkflowRuntime.handlers()` and `Workflow.usesActions` are replaced by `WorkflowRuntime.actions`: a map whose keys are the actions the plan may emit and whose values run them — a handler, or `{ port, method }` for a method its port marked with the new `acceptsAction`, which the host calls with the action and its context and whose answer lands in `outcomes` under the action's name. The mount refuses at boot, by name, a key with nothing behind it, a port nothing mounted, a method the port lacks, or one that takes its own arguments rather than an action; the engine refuses a plan carrying an undeclared action before any of its actions run. A package still carrying `usesActions` or `handlers()` is refused with the sentence that says what to change.
  
  `apply` is told the move: `apply(record, plan, outcomes, observation, now, moved)`, where `moved` is `{ from, to }` for an advance and `null` otherwise. `record` has already moved, so where the work came from is `moved.from`, never `record.state`. `movedBy`, `runAction`, `implementationOf`, `undeclaredIn`, `unrunnable`, `mountedActions` and `mountedRuntime` are exported from the core.
  
  `ticket-to-qa` now resumes an answered escalation in the state that raised it — implementing, the gate, an automated or human fix, or reviewer assignment — instead of always in `HUMAN_FIX`, and starts its attempt counters again when it does. `@amykit/workflow-testkit` takes a `ports` option for actions declared as a port and a method, and `amy workflow new` scaffolds the new shape.

### Patch Changes

- Updated dependencies [d490ceb]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0
