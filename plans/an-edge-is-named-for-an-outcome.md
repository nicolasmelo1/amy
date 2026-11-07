---
sources:
  - { id: S1, kind: decision, said: "name an edge for an action's outcome, as a call's edges are named for the callee's ends: the action declares its outcomes, the diagram draws one edge each, and that state needs no decision written" }
  - { id: S2, kind: decision, said: "a terminal state with no `decide` key settles on its own; a key written for one still wins" }
  - { id: S3, kind: decision, said: "the diagram stays the source: the graph is not derived from code, and `decide` stays pure; a state with logic of its own (a ceiling, attempts, a first-look announce) stays a decided state" }
  - { id: S4, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "returnEdges", said: "a call state's edges out are checked at mount against the callee's ends: every edge names an end, every end has exactly one edge" }
  - { id: S5, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "decisionsFit", said: "every drawn state that is not a call or a fork needs a `decide` key, terminal states included, so `DONE: () => settled(...)` is written for every end" }
  - { id: S6, kind: code, ref: "packages/core/src/diagram.ts", symbol: "DrawnTransition", said: "a label is prose for a reader; amy does not interpret it, except on the edges out of a call" }
  - { id: S7, kind: code, ref: "packages/core/src/diagram.ts", symbol: "DIAGRAM_CLASSES", said: "a state's role is a class the diagram draws: waiting, attention, anywhere, returns, call" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/core/src/diagram.ts
  - packages/core/src/steps.ts
  - packages/core/src/index.ts
  - packages/core/tests/steps.test.ts
  - packages/core/tests/define-workflow.test.ts
  - packages/workflow-testkit/src/**
  - packages/workflow-testkit/tests/steps.test.ts
  - packages/workflow-errand/src/decide.ts
  - docs/concepts/workflows.md
  - docs/build/write-a-workflow.md
untouched:
  - plugins/serial-engine/src/**
  - packages/core/src/work.ts
criteria:
  - { id: A1, statement: "a state drawn with `class X step` runs the one action its `steps` entry names, and moves along the edge labelled with the outcome that action returned, with no `decide` key for it", proof: "deferred:test:packages/core/tests/steps.test.ts", sources: [S1, S4, S6, S7] }
  - { id: A2, statement: "a step state is refused at mount, by name, when an edge out of it names no declared outcome, an outcome has no edge, two edges name one outcome, or a `decide` key is written for it", proof: "deferred:test:packages/core/tests/steps.test.ts", sources: [S1, S4, S5] }
  - { id: A3, statement: "an action that returns an outcome its step did not declare fails the action naming the outcome and the ones declared, and the record does not move", proof: "deferred:test:packages/core/tests/steps.test.ts", sources: [S1] }
  - { id: A4, statement: "a terminal state with no `decide` key settles naming the state; one with a key settles as its key says", proof: "deferred:test:packages/core/tests/define-workflow.test.ts", sources: [S2, S5] }
  - { id: A5, statement: "the testkit walks every outcome edge of a step state from the diagram and the declaration alone", proof: "deferred:test:packages/workflow-testkit/tests/steps.test.ts", sources: [S1] }
  - { id: A6, statement: "the errand workflow writes no decision for `DONE` or `DECLINED` and its walkthrough is unchanged", proof: "deferred:test:packages/workflow-errand/tests/walkthrough.test.ts", sources: [S2, S3] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:test:packages/core/tests/steps.test.ts" }
  - { mechanism: calls, answer: works, proof: "deferred:test:packages/core/tests/steps.test.ts; a step state inside a called workflow moves the callee, and a step and a call on one state is refused at mount" }
  - { mechanism: hooks, answer: works, proof: "deferred:test:packages/core/tests/steps.test.ts; `before` answers ahead of a step state and `after` sees the plan it produced, as for a decided state" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/steps.test.ts" }
  - { mechanism: record-migration, answer: n/a, why: "the outcome is read from the step's own entry in `outcomes` on the same look and folded by the wrapper `define-workflow.ts` builds around `remember`; no field is added to WorkRecord, and the errand change is to decide.ts alone" }
  - { mechanism: engines, answer: n/a, why: "a step's plan is produced inside `plan` and its fold inside `apply`; the Worker sees an ordinary act and advance" }
guarantee:
  - { holds: "a step state moves only along the edge named for the outcome its action returned", not_against: "an action that returns an undeclared outcome, which fails the action and leaves the record where it was" }
  - { holds: "a terminal state without a key settles; with one, the key decides", not_against: "a non-terminal state without a key, which is refused at mount as today" }
failures:
  - { step: "the step's action", when: "it throws", goes_to: "a failed tick, as any action; the next look acts again" }
  - { step: "the step's action", when: "it returns a name its step did not declare", goes_to: "a failed action naming both, the record unmoved" }
cut:
  - "graph derived from code (`.after(x.fails)` in TypeScript): refused; workflow.mmd stays the source (S3)"
  - "attempt ceilings, backoff or announcements on a step: a state that needs them is a decided state (S3)"
  - "checking the labels of a decided state's edges: they stay prose (S6)"
  - "a join over several steps (`allOf`): forks and lanes already do it"
exit: "a workflow draws `SCREENING --> REVIEW: PASSES` and `SCREENING --> BLOCKED: FAILS` with `class SCREENING step`, writes no decision for SCREENING, BLOCKED or any end, and mounts, walks and settles"
---
# An edge is named for an outcome

A call's edges are already named for where the callee ends, and the mount checks them. An action's are not: a state that only runs one action and goes where its result says still needs an `if` in `decide`, and every terminal state needs a `settled` written by hand. Naming the edge for the outcome makes those states, and every end, nothing but the diagram.
