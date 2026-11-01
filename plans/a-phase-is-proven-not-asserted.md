---
sources:
  - { id: S1, kind: reference, ref: "docs/design/a-project-is-three-phases.md", said: "asks for the slot; this plan is what goes in the third, the phase that exists nowhere in amy today" }
  - { id: S2, kind: decision, said: "a workflow's walkthrough drives the lifecycle against a fake world in milliseconds: right for a state machine, silent on whether the produced work holds" }
  - { id: S3, kind: friction, said: "a batch insert and two batch updates, 26 unit tests mocking the driver, all green, asserted only statement text; the real server rejected all three on the first row; preparing each against it found them in one command" }
  - { id: S4, kind: friction, said: "one failed because a VALUES parameter has no column to type it and reads as text; two because an UPDATE target cannot be referenced from a JOIN" }
  - { id: S5, kind: friction, said: "a plan named three user-visible outcomes and no example; partial payment plus credit — systems agree, badge says not — was found by a reviewer after the code was written" }
  - { id: S6, kind: decision, said: "passing the tests a branch can run is not evidence the work holds" }
  - { id: S7, kind: decision, said: "a phase is complete when a named scenario exists, a real cheap agent completes the flow from a customer-shaped prompt against the real local system, every required assertion is passed and none unsupported" }
  - { id: S8, kind: decision, said: "and the run leaves a redacted artifact attached as evidence; unit, integration or scripted tests passing is not completion" }
  - { id: S9, kind: decision, said: "a link to the common document is not a substitute for the phase's own scenario: each phase names its own, cited rather than gestured at" }
  - { id: S10, kind: decision, said: "unsupported is a state of its own: an assertion the harness could not evaluate is the thing most often counted as success" }
  - { id: S11, kind: decision, said: "2026-10-01: the proof is a project artifact, not an execution state — one record per unit beside the briefs in the artifact root, written by test/, read by the others" }
  - { id: S12, kind: decision, said: "no phase reaches into another's lifecycle, so the three stay independently driven, budgeted and stoppable" }
  - { id: S13, kind: decision, said: "a proof can be manual: the record makes it one, not who ran it; it names the scenario, each assertion's status, who ran it and what it ran against" }
  - { id: S14, kind: decision, said: "a proof records the code digest and the brief revision it proved; when either moves it stops counting and the unit is unproven, which does not count as done" }
  - { id: S15, kind: decision, said: "a missing brief/ or test/ is a warning: the project boots and amy doctor names each missing folder and what it loses" }
  - { id: S16, kind: decision, said: "naming the proving scenario in planning forces an example, the cheapest instrument for the case a prose requirement left open, two phases before a reviewer" }
touches:
  - packages/core/src/proving.ts
  - packages/core/src/ports/Proof.ts
  - packages/core/src/mount.ts
  - packages/core/tests/proving.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/doctor.test.ts
criteria:
  - { id: A1, statement: "a unit of work that names no scenario cannot leave the planning phase, and the refusal names the unit", proof: "test:packages/core/tests/proving.test.ts", sources: [S5, S9, S16] }
  - { id: A2, statement: "a scenario runs against the real system rather than the walkthrough's fake world, and a scenario whose only actor is the fake world is refused", proof: "assertion:proof.the_scenario_drove_the_real_system", sources: [S1, S2, S3, S4, S6, S7, S8] }
  - { id: A3, statement: "an assertion the harness cannot evaluate blocks completion, naming the assertion and why, rather than counting as a pass", proof: "test:packages/core/tests/proving.test.ts", sources: [S7, S10] }
  - { id: A4, statement: "a proof is a record in the project's artifact root, written by the proving phase and read by the others, with no phase reading another's records or queue", proof: "assertion:proof.a_proof_crosses_the_phase_boundary", sources: [S11, S12] }
  - { id: A5, statement: "a person can record a manual run as the proof, naming who ran it and each assertion's status", proof: "assertion:proof.a_manual_run_is_a_proof", sources: [S13] }
  - { id: A6, statement: "a proof whose code digest or brief revision no longer matches what it certified stops counting, and the unit it proved is unproven again", proof: "assertion:proof.the_artifact_expires_with_its_subject", sources: [S14] }
  - { id: A7, statement: "a project without brief/ or test/ boots, and amy doctor names each missing folder and what the project loses without it", proof: "test:packages/cli/tests/doctor.test.ts", sources: [S15] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A1, A7" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the proof port reads and writes project artifacts; no tracker or code-host write is added" }
guarantee:
  - { holds: "a proven unit's scenario holds against the real system", not_against: "a well-proven scenario for the wrong feature" }
  - { holds: "no phase reads another phase's records or queue", not_against: "reading the proof record in the shared artifact root" }
failures:
  - { step: planning, when: "a unit names no scenario", goes_to: "cannot leave planning; refusal names the unit" }
  - { step: proving, when: "an assertion cannot be evaluated", goes_to: "completion blocked, naming the assertion and why" }
  - { step: lock, when: "code digest or brief revision moved", goes_to: "the unit is unproven again" }
  - { step: boot, when: "brief/ or test/ is missing", goes_to: "boots; amy doctor warns" }
cut:
  - "how a scenario is expressed: any schema; the core mounts a port and refuses an unproven unit, it learns no scenario language"
  - "judging whether the work is any good: this proves a scenario holds"
  - "replacing the walkthrough: the state machine keeps its fast fake-world test; two tests, two subjects"
  - "refusing a project missing a phase: it would block every project before a proving phase has anything to run"
exit: "a unit naming no scenario example cannot leave planning; a phase run with an unevaluated assertion is refused, naming it; a person's manual run locks a unit proven; one proven last month on since-changed code or brief becomes unproven unprompted"
---
# A phase is proven, not asserted

Passing the tests a branch can run is not evidence the work holds: two failures
in one day went through green, and amy has no phase that proves work against
the real system.
