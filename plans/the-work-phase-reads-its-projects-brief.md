---
base: 857a61256078d484459436c45af65f085d09569d
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/project.ts", symbol: "resolvePhases", said: "a project's phase presence is read from its folders, and a workflow's `phases:` absence note is refused as a conflict when the folder is there" }
  - { id: S2, kind: code, ref: "packages/cli/src/project.ts", symbol: "bindingsFor", said: "a phase is called with the settings its schema validated, and nothing else about the phase rides the call" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/src/agent-steps.ts", symbol: "briefLines", said: "every prompt that carries a brief labels it `the feature this ticket belongs to`, whether the brief is the feature's or the unit's own" }
  - { id: S4, kind: code, ref: "examples/workflow-ticket-to-qa/src/actions.ts", symbol: "ACTIONS", said: "triage records what the agent said, and ask-question resolves the brief again from the ticket's briefId when it appends" }
  - { id: S5, kind: decision, said: "the proof must walk the shipped ticket-to-qa as the project's work phase, with a parent brief stored beside the unit's own, so the stand-in cannot stand for the product. Asked by the reviewer's red test" }
  - { id: S6, kind: friction, said: "the project-phases proof used a stand-in work phase that resolved the brief itself, so it stayed green whatever the product read; a multi-repo ticket read its brief under the ticket id, not the unit work id" }
  - { id: S7, kind: decision, said: "a present phase folder wins over a workflow's note that the phase is absent: the note describes the walk the workflow runs alone, and the project's folders decide which phases run" }
  - { id: S8, kind: decision, said: "the brief a triage prompt was built from is recorded with the triage outcome, and ask-question appends there without reading the store again" }
  - { id: S9, kind: decision, said: "a prompt names the brief as the one the ticket is worked against, never as the feature's, because a unit's own brief is not its parent's" }
  - { id: S10, kind: decision, said: "briefOf names the id whose read failed and keeps the store's error as the cause, so a corrupted brief says which one" }
touches:
  - packages/cli/src/project.ts
  - packages/core/src/ports/Brief.ts
  - packages/core/tests/Brief.test.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/agent-steps.ts
  - examples/workflow-ticket-to-qa/src/observation.ts
  - examples/workflow-ticket-to-qa/src/lanes.ts
  - examples/workflow-ticket-to-qa/tests/own-brief.test.ts
  - examples/workflow-ticket-to-qa/tests/self-review.test.ts
  - scripts/tests/project-brief-reaches-work-gate.test.ts
  - .software-factory/evidence/project-phases-scenario.sh
  - registry/cli.json
  - registry/core.json
  - registry/workflow-ticket-to-qa.json
  - docs/design/the-work-phase-reads-its-projects-brief.md
  - CONTRIBUTING.md
criteria:
  - { id: A1, statement: "the project-phases proof walks the shipped ticket-to-qa as the work phase and the unit's own brief reaches triage ahead of the parent's", proof: "deferred:test:scripts/tests/project-brief-reaches-work-gate.test.ts", sources: [S1, S4, S5, S6] }
  - { id: A2, statement: "a unit's brief is read under its work id, including PROJ-1239@acme%2Fapi, ahead of the tracker's briefId", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/own-brief.test.ts", sources: [S4, S6, S8] }
  - { id: A3, statement: "triage's question is appended to the brief its prompt was built from, not one written while the agent read", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/own-brief.test.ts", sources: [S4, S8] }
  - { id: A4, statement: "no prompt calls a unit's own brief the feature's, in triage or self-review", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/own-brief.test.ts", sources: [S3, S9] }
  - { id: A5, statement: "briefOf names the id whose read failed, the unit's or the parent's, and keeps the store's error as its cause", proof: "deferred:test:packages/core/tests/Brief.test.ts", sources: [S10] }
  - { id: A6, statement: "a phase folder that is present runs, whatever absence note the workflow that drives it carries", proof: "deferred:test:.software-factory/evidence/project-phases-scenario.sh", sources: [S1, S2, S7] }
crosses:
  - { mechanism: briefs, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/own-brief.test.ts" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:test:scripts/tests/project-brief-reaches-work-gate.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "no write changes: briefId is read as the tracker gives it, and the only write is appendQuestion to a brief that already exists" }
guarantee:
  - { holds: "a project whose work phase is the shipped workflow walks its brief phase and reads that brief at triage", not_against: "a packaged workflow whose brief phase is absent says so and still mounts alone" }
  - { holds: "a ticket with no brief under its own work id reads its parent's brief as before", not_against: "a brief written under a unit's work id by hand: it is the unit's own from then on" }
failures:
  - { step: observe, when: "the brief store cannot read a brief", goes_to: "the error names the id, the unit's or the parent's, with the store's error as the cause" }
  - { step: triage, when: "a brief appears while the agent is reading", goes_to: "the question goes to the brief the prompt was built from; the next look reads the new one" }
cut:
  - "re-keying the tracker's briefId: the parent stays the tracker's fact"
  - "merging two briefs: one brief is read, never two folded together"
exit: "the shipped workflow works a unit against the brief its project judged, under its own work id, with prompts that say which brief they carry"
---
# The work phase reads its project's brief

The project-phases proof now walks the shipped ticket-to-qa as the work phase,
with the unit's own brief and the parent's stored, so only the unit's own
reaches triage; a present folder wins over a workflow's absence note, and
triage records the brief its question belongs to.
