---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: friction, said: "2026-11-12: a record saved in a state the workflow.mmd no longer draws, removed or renamed, cannot move, and amy never says the workflow changed under it" }
  - { id: S2, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "plan", said: "a record in a state with no decision throws `has no decision for state X` at the look, not at the mount" }
  - { id: S3, kind: code, ref: "plugins/serial-engine/src/Worker.ts", symbol: "recordFailure", said: "a thrown look is retried as a transient error, maxItemAttempts 5 every retryDelayMs 5 minutes, then the work is given up and leaves the queue" }
  - { id: S4, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "decisionsFit", said: "the mount compares the diagram with decide; no saved record is ever compared with the diagram" }
  - { id: S5, kind: code, ref: "packages/core/src/calls.ts", symbol: "folded", said: "a called workflow's record and each lane's live inside the caller's record and are planned by their own workflow, so a gone state there takes the same path" }
  - { id: S6, kind: code, ref: "plugins/concurrent-engine/src/plugin.ts", said: "the concurrent engine runs the serial engine's Worker with concurrent lanes, so one check in the Worker covers both engines" }
  - { id: S7, kind: reference, ref: "docs/design/a-question-carries-its-answers.md", said: "an ask carries its answers; where the conversation can show them they are controls, and a selected answer comes back typed as a decision" }
  - { id: S8, kind: code, ref: "packages/core/src/operator.ts", symbol: "sayToOperator", said: "one thing said to the operator goes to the work's own thread when a conversation is mounted, where a reply can be read back, and through the notifier otherwise" }
  - { id: S9, kind: decision, said: "a record whose state is gone always escalates: never retried, never moved by amy; the person is asked what next from a list of options and the work goes on from the answer. Decided 2026-11-12" }
  - { id: S10, kind: decision, said: "answering in words is enough: a reply naming one option is the answer, no button needed. Decided 2026-11-12" }
  - { id: S11, kind: decision, said: "the options are every state the workflow draws now, then giving the work up; the question is asked once, and a reply that names none is answered with the options again. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "with no conversation mounted, the notifier carries the question and the answer is `amy move`, a new command; amy doctor lists every record in a state its workflow no longer draws. Proposed 2026-11-12" }
touches:
  - packages/core/src/plugin.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/calls.ts
  - packages/core/src/work.ts
  - packages/core/src/ports/EventLog.ts
  - packages/core/events.json
  - packages/core/tests/define-workflow.test.ts
  - packages/core/tests/calls.test.ts
  - plugins/serial-engine/src/Worker.ts
  - plugins/serial-engine/tests/Worker.gone.test.ts
  - plugins/serial-engine/tests/gone.property.test.ts
  - plugins/concurrent-engine/tests/lanes.test.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/move.test.ts
  - packages/cli/tests/doctor.test.ts
  - docs/reference/events.md
  - docs/reference/cli.md
  - docs/concepts/the-engine.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/gone-state-scenario.sh
criteria:
  - { id: A1, statement: "a workflow says which saved state it no longer draws: the record's own, a called child's or a lane's, naming whose it is", proof: "deferred:test:packages/core/tests/define-workflow.test.ts", sources: [S1, S4, S5] }
  - { id: A2, statement: "a look at a record in a gone state never plans, never throws and never retries: it escalates, records work.state_gone and charges no attempt", proof: "deferred:test:plugins/serial-engine/tests/Worker.gone.test.ts", sources: [S2, S3, S9] }
  - { id: A3, statement: "for any number of looks while it waits, the question reaches the person exactly once, in the work's thread or else through the notifier", proof: "deferred:property:plugins/serial-engine/tests/gone.property.test.ts#asked_every_look", sources: [S8, S9, S11] }
  - { id: A4, statement: "the question names the gone state and offers every state the workflow draws now plus giving the work up, as an ask carrying those answers", proof: "deferred:test:plugins/serial-engine/tests/Worker.gone.test.ts", sources: [S7, S11] }
  - { id: A5, statement: "a selected answer, or a reply whose words name exactly one option, moves the record there with work.moved naming who chose; giving up gives the work up", proof: "deferred:test:plugins/serial-engine/tests/Worker.gone.test.ts", sources: [S9, S10] }
  - { id: A6, statement: "for any reply that names no option or several, nothing moves and the reply is answered with the options again, once per reply", proof: "deferred:property:plugins/serial-engine/tests/gone.property.test.ts#a_vague_reply_moves", sources: [S10, S11] }
  - { id: A7, statement: "a called child or a lane in a gone state is asked about by its own id and its own workflow's states, and the answer moves it inside its caller", proof: "deferred:test:packages/core/tests/calls.test.ts", sources: [S5, S9] }
  - { id: A8, statement: "the concurrent engine escalates a gone lane the same way, while its other lanes keep moving", proof: "deferred:test:plugins/concurrent-engine/tests/lanes.test.ts", sources: [S6] }
  - { id: A9, statement: "with no conversation mounted, `amy move <work> <STATE>` answers the question, and refuses a state the workflow does not draw, naming the options", proof: "deferred:test:packages/cli/tests/move.test.ts", sources: [S12] }
  - { id: A10, statement: "amy doctor lists every saved record, child or lane in a state its workflow no longer draws, naming the record, the state and its workflow", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S4, S12] }
  - { id: A11, statement: "the built engine, in another process, given a record in a state removed from its diagram, asks once, and the reply naming a drawn state moves it there", proof: "assertion:engine.a_gone_state_asks_where_it_goes", sources: [S1, S9] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A2; a record saved before this reads with no question asked, and one given up by the old retry path is asked once it is poked" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A2; a gone state charges no attempt and waits on the answer as an escalation does" }
  - { mechanism: calls, answer: works, proof: "deferred:A7" }
  - { mechanism: hooks, answer: n/a, why: "a gone state is caught before before, decide and after run; no hook is asked about a state that is not drawn" }
  - { mechanism: engines, answer: works, proof: "deferred:A2, A8" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "an escalated look starts no agent run and adds no evidence; the budget is never asked" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A1; the mount still refuses a decide that does not fit the diagram, unchanged" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "EventLog gains two kinds; nothing is written to a tracker or code host" }
guarantee:
  - { holds: "a record in a state the diagram no longer draws is never retried, never moved by amy, and is asked about once", not_against: "a person who never answers: the work waits, as any escalation does" }
  - { holds: "only an answer that names exactly one option moves the work", not_against: "a person naming the wrong drawn state on purpose" }
failures:
  - { step: ask, when: "neither a conversation nor a notifier can reach the person", goes_to: "notify.failed is logged and the record waits; amy doctor lists it" }
  - { step: answer, when: "the named state is removed again before the move", goes_to: "the record is asked about again, naming the new options" }
cut:
  - "moving a record automatically to a renamed state's likely heir: the person decides (S9)"
  - "a migration map in the workflow from old states to new: later, if escalations prove frequent"
exit: "PROJ-1 saved in a state since removed from its workflow.mmd: one question with the drawn states and give it up, a reply naming IMPLEMENTING moves it there, no attempt charged"
---
# A record whose state is gone asks where it goes

A record left in a state the diagram no longer draws fails as if transiently,
five times over twenty minutes, and is given up without saying why. Instead it
escalates once, offering the states drawn now and giving it up, and the work
goes on from the person's answer.
