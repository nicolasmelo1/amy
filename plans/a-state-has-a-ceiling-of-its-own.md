---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: reference, ref: "plans/a-workflow-learns-from-its-mistakes.md", said: "one install's 715 agent.run events: SELF_REVIEW on Opus was 73% of the spend, 0.71 US$ a run against 0.21 for IMPLEMENTING on Sonnet, and nothing showed it" }
  - { id: S2, kind: code, ref: "packages/core/src/budget.ts", symbol: "budgetDecision", said: "the budget has one ceiling per window for the whole install, read from agent.run events; no state can be held to less than the rest" }
  - { id: S3, kind: code, ref: "packages/core/src/action-ports.ts", symbol: "actionPorts", said: "every agent.run event is written with the work's id and the state the record was in when the agent was asked" }
  - { id: S4, kind: code, ref: "plugins/serial-engine/src/Worker.ts", symbol: "parked", said: "the Worker asks the budget before a move that reaches the agent port, knowing the record's state, and parks it with budget.parked" }
  - { id: S5, kind: reference, ref: "https://joydle.github.io/borg/", said: "Borg checks a budget before each dispatch, with sub-budgets per composition" }
  - { id: S6, kind: decision, said: "a step can be given a ceiling of its own, so an expensive step stops on its own instead of spending the whole window. Decided 2026-11-12" }
  - { id: S7, kind: decision, said: "the step is the drawn state the agent ran in, since the log and the Worker both know it: agent.budget.byState.<STATE> with perFiveHours and perWeek and the same stopAt. Proposed 2026-11-12" }
  - { id: S8, kind: decision, said: "a state's ceiling only adds a refusal: the install's ceilings still apply, and the first ceiling past stopAt answers, the state's before the install's. Proposed 2026-11-12" }
touches:
  - packages/core/src/budget.ts
  - packages/core/src/budget-config.ts
  - packages/core/src/ports/Budget.ts
  - packages/core/tests/budget.test.ts
  - packages/core/tests/budget-config.test.ts
  - packages/core/tests/budget.property.test.ts
  - plugins/serial-engine/src/Worker.ts
  - plugins/serial-engine/tests/budget.test.ts
  - plugins/agent-relay/src/config.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/tests/plugin.test.ts
  - plugins/agent-relay/README.md
  - packages/cli/src/budget.ts
  - packages/cli/tests/budget.test.ts
  - docs/concepts/budgets.md
  - docs/reference/plugins.md
  - registry/plugin-agent-relay.json
  - .software-factory/policy.yaml
  - .software-factory/evidence/plugin-agent-relay/probe.ts
criteria:
  - { id: A1, statement: "agent.budget.byState mounts a ceiling per named state in perFiveHours and perWeek, tokens and/or costUsd; an unknown window, measure or empty state is refused at boot naming it", proof: "deferred:test:packages/core/tests/budget-config.test.ts", sources: [S6, S7] }
  - { id: A2, statement: "a state's spend is the agent.run events written in that state within the window, read from the log like the install's", proof: "deferred:test:packages/core/tests/budget.test.ts", sources: [S2, S3, S7] }
  - { id: A3, statement: "for any log and limits, a move in a state is refused exactly when its state's ceiling or the install's is past stopAt; a state with no ceiling answers as today", proof: "deferred:property:packages/core/tests/budget.property.test.ts#state_spend_counts_every_state", sources: [S2, S8] }
  - { id: A4, statement: "a move refused by its state's ceiling parks with budget.parked naming the state, window, measure, used, limit and how long until there is room", proof: "deferred:test:plugins/serial-engine/tests/budget.test.ts", sources: [S4, S7] }
  - { id: A5, statement: "while one state is parked by its ceiling, work in every other state goes on starting agent runs", proof: "deferred:test:plugins/serial-engine/tests/budget.test.ts", sources: [S1, S6] }
  - { id: A6, statement: "a lane's or called workflow's run is charged and checked under the state it ran in, never its caller's", proof: "deferred:test:plugins/serial-engine/tests/budget.test.ts", sources: [S3, S7] }
  - { id: A7, statement: "amy budget shows each state with a ceiling beside the install's, with what it used and how long until it has room", proof: "deferred:test:packages/cli/tests/budget.test.ts", sources: [S1, S6] }
  - { id: A8, statement: "a state's ceiling naming a state no mounted workflow draws is refused at boot, naming the states there are", proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts", sources: [S7] }
  - { id: A9, statement: "the built relay, in another process, parks SELF_REVIEW at its own ceiling while IMPLEMENTING still starts", proof: "assertion:relay.a_state_stops_at_its_own_ceiling", sources: [S1, S5, S6] }
crosses:
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A3, A4, A5" }
  - { mechanism: engines, answer: works, proof: "deferred:A6; both engines ask the budget through the same Worker" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the Budget port's mayStart gains the state it is asked for; nothing is written to a tracker or code host" }
  - { mechanism: agent-replies, answer: n/a, why: "the relay mounts a budget that reads the log; no agent reply is read differently" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a parked move charges no attempt, as a parked move does today" }
guarantee:
  - { holds: "a state past its own ceiling starts no new agent run until its window has room", not_against: "a run already in flight when the ceiling was crossed" }
  - { holds: "a state's ceiling never lets through what the install's ceiling refuses", not_against: "the budget.bench timing with many states, which the performance guard measures" }
failures:
  - { step: mount, when: "byState names a state no mounted workflow draws", goes_to: "refused at boot, naming the states there are" }
  - { step: decide, when: "the log cannot be read", goes_to: "the budget answers as it does today when its log fails" }
cut:
  - "a ceiling per model or harness: the ladder's business"
  - "a ceiling per piece of work: the progress ceiling already stops a run that adds nothing"
exit: "with byState.SELF_REVIEW at 20 US$ a week, the twenty-first dollar of reviews parks SELF_REVIEW naming it, while IMPLEMENTING goes on, and amy budget shows both"
---
# A state has a ceiling of its own

The budget has one ceiling for the whole install, so a step that costs three
times the others spends the whole window before anything stops it. A state can
now carry a ceiling of its own, read from the same log, and only that state
parks when it is reached.
